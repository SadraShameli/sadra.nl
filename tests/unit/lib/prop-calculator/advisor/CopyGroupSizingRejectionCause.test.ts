import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    dollars,
    findFirm,
    FirmAccountPolicy,
    FirmId,
    InstrumentSymbol,
    type LiveTransitionTrigger,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    type PlanId,
    PolicySourceKind,
    PolicyVerification,
    serializePlanId,
    SingleDayProfitTrigger,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    copyGroupSizing,
    type CopyGroupSizingMember,
    CopyGroupSizingRejectionKind,
    CopyGroupSizingResultKind,
    DEFAULT_RULEBOOK,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor';

const MFF_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
};

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

const NQ_AT_100_POINTS = {
    instrument: InstrumentSymbol.NQ,
    stopPoints: 100,
} as const;

class StubTriggerPolicy extends FirmAccountPolicy {
    constructor(private readonly triggers: readonly LiveTransitionTrigger[]) {
        super();
    }

    override liveTriggersFor(): readonly LiveTransitionTrigger[] {
        return this.triggers;
    }
}

const state: AccountState = {
    balance: 55_000,
    bestDayProfit: 0,
    consecutiveIdleDays: 0,
    intradayHighProfit: 0,
    peakDayCloseProfit: 0,
    peakIntradayProfit: 0,
    qualifyingDays: 20,
    startingBalance: 50_000,
    threshold: 50_100,
    thresholdLocked: true,
    todayPnL: 0,
    tradingDays: 20,
};

const singleDayPolicy = new StubTriggerPolicy([
    new SingleDayProfitTrigger(dollars(250), true, false, CONFIRMED_SOURCE),
]);

function fundedAccount(
    accountState: AccountState = state,
): ReconstructedFundedOrEvalAccount {
    return {
        assumptions: [],
        contractLimit: null,
        cushion: accountState.balance - accountState.threshold,
        fundedTracker: newFundedCycleTracker({
            ...accountState,
            balance: accountState.startingBalance,
        }),
        kind: TradingPhase.Funded,
        plan: registryPlan(MFF_PRO_ID),
        resolvedDailyLossLimit: null,
        state: accountState,
    };
}

function member(
    id: string,
    options: {
        readonly accountPolicy?: FirmAccountPolicy;
        readonly accountState?: AccountState;
    } = {},
): CopyGroupSizingMember {
    return {
        account: fundedAccount(options.accountState),
        accountPolicy: options.accountPolicy ?? null,
        id,
        label: id,
        paidPayoutsSinceLastLiveAccount: null,
    };
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

function sizeGroup(
    members: readonly CopyGroupSizingMember[],
    positionSizing?: {
        readonly instrument: InstrumentSymbol;
        readonly stopPoints: number;
    },
) {
    return copyGroupSizing({
        members,
        ...(positionSizing !== undefined && { positionSizing }),
        rulebook: DEFAULT_RULEBOOK,
    });
}

describe('a copy group with no rung names the real cause (PT-36h review)', () => {
    it('says one contract at the entered stop risks more than the ceiling-capped size, naming the members', () => {
        const result = sizeGroup(
            [
                member('a', { accountPolicy: singleDayPolicy }),
                member('b', { accountPolicy: singleDayPolicy }),
            ],
            NQ_AT_100_POINTS,
        );

        expect(result.kind).toBe(CopyGroupSizingResultKind.Rejected);
        if (result.kind !== CopyGroupSizingResultKind.Rejected) return;
        expect(result.rejection.kind).toBe(
            CopyGroupSizingRejectionKind.BelowOneContractAtStop,
        );
        if (
            result.rejection.kind !==
            CopyGroupSizingRejectionKind.BelowOneContractAtStop
        ) {
            return;
        }
        expect(result.rejection.memberIds).toEqual(['a', 'b']);
        expect(result.rejection.message).toContain('one contract');
        expect(result.rejection.message).not.toContain('cushion');
    });

    it('sizes the same group when the stop is small enough to place a contract', () => {
        const result = sizeGroup(
            [member('a', { accountPolicy: singleDayPolicy })],
            { instrument: InstrumentSymbol.MNQ, stopPoints: 20 },
        );

        expect(result.kind).toBe(CopyGroupSizingResultKind.Sized);
    });

    it('still says no cushion room when the member has no cushion', () => {
        const noCushion: AccountState = {
            ...state,
            balance: 50_100,
            threshold: 50_100,
        };
        const result = sizeGroup(
            [member('a', { accountState: noCushion })],
            NQ_AT_100_POINTS,
        );

        expect(result.kind).toBe(CopyGroupSizingResultKind.Rejected);
        if (result.kind !== CopyGroupSizingResultKind.Rejected) return;
        expect(result.rejection.kind).toBe(
            CopyGroupSizingRejectionKind.NoCushionRoom,
        );
    });

    it('does not blame the stop for a member with no cushion beside a member whose stop is too wide', () => {
        const noCushion: AccountState = {
            ...state,
            balance: 50_100,
            threshold: 50_100,
        };
        const result = sizeGroup(
            [
                member('a', { accountPolicy: singleDayPolicy }),
                member('b', {
                    accountPolicy: singleDayPolicy,
                    accountState: noCushion,
                }),
            ],
            NQ_AT_100_POINTS,
        );

        expect(result.kind).toBe(CopyGroupSizingResultKind.Rejected);
        if (result.kind !== CopyGroupSizingResultKind.Rejected) return;
        expect(result.rejection.kind).toBe(
            CopyGroupSizingRejectionKind.NoCushionRoom,
        );
        if (
            result.rejection.kind !== CopyGroupSizingRejectionKind.NoCushionRoom
        ) {
            return;
        }
        expect(result.rejection.memberIds).toEqual(['b']);
    });
});
