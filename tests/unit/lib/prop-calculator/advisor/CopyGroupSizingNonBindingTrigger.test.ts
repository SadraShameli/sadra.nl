import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    dollars,
    findFirm,
    FirmAccountPolicy,
    FirmId,
    InstrumentSymbol,
    type LiveTransitionTrigger,
    MffuVariant,
    newFundedCycleTracker,
    PayoutCountTotalTrigger,
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
    CopyGroupSizingResultKind,
    DEFAULT_RULEBOOK,
    documentedSizingOf,
    LiveTriggerCoverage,
    NO_PENDING_PAYOUT_COUNTS,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor';

const MFF_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
};

const APEX_EOD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
};

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

const NQ_AT_20_POINTS = {
    instrument: InstrumentSymbol.NQ,
    stopPoints: 20,
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

function evalAccount(): ReconstructedFundedOrEvalAccount {
    const evalState: AccountState = {
        ...state,
        balance: 50_600,
        qualifyingDays: 0,
        threshold: 48_500,
        thresholdLocked: false,
        tradingDays: 0,
    };
    return {
        assumptions: [],
        contractLimit: null,
        cushion: evalState.balance - evalState.threshold,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan: registryPlan(APEX_EOD_ID),
        resolvedDailyLossLimit: null,
        state: evalState,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function fundedAccount(): ReconstructedFundedOrEvalAccount {
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: newFundedCycleTracker({
            ...state,
            balance: state.startingBalance,
        }),
        kind: TradingPhase.Funded,
        plan: registryPlan(MFF_PRO_ID),
        resolvedDailyLossLimit: null,
        state,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function member(
    id: string,
    extras: Partial<CopyGroupSizingMember> = {},
): CopyGroupSizingMember {
    return {
        account: fundedAccount(),
        accountPolicy: null,
        id,
        label: id,
        paidPayoutsSinceLastLiveAccount: null,
        personalRequestOverride: null,
        personalRetainedCushion: null,
        ...extras,
    };
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

function singleDayPolicy(amount: number): FirmAccountPolicy {
    return new StubTriggerPolicy([
        new SingleDayProfitTrigger(
            dollars(amount),
            true,
            false,
            CONFIRMED_SOURCE,
        ),
    ]);
}

function sized(members: readonly CopyGroupSizingMember[]) {
    const result = copyGroupSizing({
        members,
        positionSizing: NQ_AT_20_POINTS,
        rulebook: DEFAULT_RULEBOOK,
    });
    if (result.kind !== CopyGroupSizingResultKind.Sized) {
        throw new Error('the group was rejected');
    }
    return result;
}

describe('copy-group sizing with a verified trigger room between the flat rung and one contract (PT-36f review)', () => {
    it.each([550, 650, 750])(
        'sizes the group at the flat rung under a $%d trigger at NQ 20 points, never a no-cushion-room rejection',
        (triggerAmount) => {
            const policy = singleDayPolicy(triggerAmount);

            const result = sized([
                member('a', { accountPolicy: policy }),
                member('b', { accountPolicy: policy }),
            ]);

            expect(result.sizing.rungs[0]?.risk).toBe(
                DEFAULT_RULEBOOK.funded.riskCents / 100,
            );
        },
    );
});

describe('copy-group sizing says whether the live triggers were enforced (PT-36f review)', () => {
    it('is not checked when a member carries no account policy', () => {
        expect(sized([member('a'), member('b')]).liveTriggerCoverage).toBe(
            LiveTriggerCoverage.NotChecked,
        );
    });

    it('is not checked when only one member carries a verified policy', () => {
        const policy = singleDayPolicy(650);
        const result = sized([
            member('a', { accountPolicy: policy }),
            member('b'),
        ]);

        expect(result.liveTriggerCoverage).toBe(LiveTriggerCoverage.NotChecked);
    });

    it('is enforced when every member carries a verified single-day trigger', () => {
        const policy = singleDayPolicy(650);

        expect(
            sized([
                member('a', { accountPolicy: policy }),
                member('b', { accountPolicy: policy }),
            ]).liveTriggerCoverage,
        ).toBe(LiveTriggerCoverage.Enforced);
    });

    it('stays not checked for a firm-wide count trigger until the member passes the firm payout count', () => {
        const policy = new StubTriggerPolicy([
            new PayoutCountTotalTrigger(10, CONFIRMED_SOURCE),
        ]);

        const withoutCount = sized([member('a', { accountPolicy: policy })]);
        const withCount = sized([
            member('a', {
                accountPolicy: policy,
                paidPayoutsSinceLastLiveAccount: 3,
            }),
        ]);

        expect(withoutCount.liveTriggerCoverage).toBe(
            LiveTriggerCoverage.NotChecked,
        );
        expect(withCount.liveTriggerCoverage).toBe(
            LiveTriggerCoverage.Enforced,
        );
    });

    it('reports no coverage for an evaluation group, where no live trigger applies', () => {
        const result = copyGroupSizing({
            members: [member('a', { account: evalAccount() })],
            rulebook: DEFAULT_RULEBOOK,
        });

        expect(result.kind).toBe(CopyGroupSizingResultKind.Sized);
        if (result.kind !== CopyGroupSizingResultKind.Sized) return;
        expect(result.liveTriggerCoverage).toBeNull();
    });

    it('carries the coverage of one member through documentedSizingOf', () => {
        const policy = singleDayPolicy(650);
        const withPolicy = documentedSizingOf(
            fundedAccount(),
            DEFAULT_RULEBOOK,
            {
                accountPolicy: policy,
            },
        );
        const withoutPolicy = documentedSizingOf(
            fundedAccount(),
            DEFAULT_RULEBOOK,
        );

        expect(withPolicy.liveTriggerCoverage).toBe(
            LiveTriggerCoverage.Enforced,
        );
        expect(withoutPolicy.liveTriggerCoverage).toBe(
            LiveTriggerCoverage.NotChecked,
        );
    });
});
