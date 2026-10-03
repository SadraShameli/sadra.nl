import { readFileSync } from 'node:fs';
import path from 'node:path';
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
    createDocumentedRule,
    DEFAULT_RULEBOOK,
    documentedSizingOf,
    type EvalRuleContext,
    EvalSizingAdvisor,
    FundedSizingAdvisor,
    NextTradeKind,
    NO_PENDING_PAYOUT_COUNTS,
    type ReconstructedFundedOrEvalAccount,
    SizingConstraint,
    SizingStage,
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

const APEX_EOD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
};

const MNQ_AT_20_POINTS = {
    instrument: InstrumentSymbol.MNQ,
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

function firstGroupRung(
    members: readonly CopyGroupSizingMember[],
    positionSizing?: typeof MNQ_AT_20_POINTS,
) {
    const result = copyGroupSizing({
        members,
        ...(positionSizing !== undefined && { positionSizing }),
        rulebook: DEFAULT_RULEBOOK,
    });
    if (result.kind !== CopyGroupSizingResultKind.Sized) {
        throw new Error('the group was rejected');
    }
    return result.sizing.rungs[0];
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
    accountPolicy?: FirmAccountPolicy,
): CopyGroupSizingMember {
    return {
        account: fundedAccount(),
        accountPolicy: accountPolicy ?? null,
        id,
        label: id,
        paidPayoutsSinceLastLiveAccount: null,
        personalRequestOverride: null,
        personalRetainedCushion: null,
    };
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

function singleAccountRung(
    accountPolicy: FirmAccountPolicy,
    positionSizing?: typeof MNQ_AT_20_POINTS,
) {
    return new FundedSizingAdvisor({
        account: fundedAccount(),
        accountPolicy,
        fundedHorizonDays: 252,
        ...(positionSizing !== undefined && { positionSizing }),
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
    }).dailyPlanCard()?.rungs[0];
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

describe('copy-group sizing applies the verified single-day trigger (PT-36f, step 3)', () => {
    it('caps the group rung at the trigger ceiling, the same rung the single-account card shows', () => {
        const policy = singleDayPolicy(250);
        const group = firstGroupRung([
            member('a', policy),
            member('b', policy),
        ]);

        expect(group?.risk).toBe(100);
        expect(group?.cappedBy).toContain(SizingConstraint.CeilingCap);
        expect(group?.risk).toBe(singleAccountRung(policy)?.risk);
    });

    it('rounds the capped group rung to whole contracts at the entered stop, like the single-account card', () => {
        const policy = singleDayPolicy(250);
        const group = firstGroupRung(
            [member('a', policy), member('b', policy)],
            MNQ_AT_20_POINTS,
        );

        expect(group?.risk).toBe(80);
        expect(group?.risk).toBe(
            singleAccountRung(policy, MNQ_AT_20_POINTS)?.risk,
        );
    });

    it('leaves the group rung at the flat risk for members whose firm has no verified trigger', () => {
        const group = firstGroupRung([member('a'), member('b')]);

        expect(group?.risk).toBe(DEFAULT_RULEBOOK.funded.riskCents / 100);
        expect(group?.cappedBy).not.toContain(SizingConstraint.CeilingCap);
    });

    it('takes the tightest member when only one member is under a verified trigger', () => {
        const group = firstGroupRung([
            member('a', singleDayPolicy(250)),
            member('b'),
        ]);

        expect(group?.risk).toBe(100);
    });

    it('applies the trigger through documentedSizingOf for one member, with the same ceiling the group used', () => {
        const { sizing } = documentedSizingOf(
            fundedAccount(),
            DEFAULT_RULEBOOK,
            {
                accountPolicy: singleDayPolicy(250),
                instrument: MNQ_AT_20_POINTS.instrument,
                stopPoints: MNQ_AT_20_POINTS.stopPoints,
            },
        );

        expect(sizing.rungs[0]?.risk).toBe(80);
    });
});

describe('copy-group sizing uses the shared placeable-minimum helper (PT-36f, step 3)', () => {
    it('decides an evaluation member first trade exactly like the single-account eval card at the same entered stop', () => {
        const hugeStop = { instrument: InstrumentSymbol.NQ, stopPoints: 300 };
        const card = new EvalSizingAdvisor({
            account: evalAccount(),
            maxEvalDays: 150,
            positionSizing: hugeStop,
            rulebook: DEFAULT_RULEBOOK,
            snapshotAsOf: '2026-09-26',
            substate: null,
            today: '2026-09-26',
        }).dailyPlanCard();
        const { context } = documentedSizingOf(
            evalAccount(),
            DEFAULT_RULEBOOK,
            {
                instrument: hugeStop.instrument,
                stopPoints: hugeStop.stopPoints,
            },
        );
        const first = createDocumentedRule(
            SizingStage.Eval,
            DEFAULT_RULEBOOK,
        ).nextTrade(context as EvalRuleContext, {
            dayPnL: dollars(0),
            losses: 0,
            runningLoss: dollars(0),
            wins: 0,
        });

        expect(card?.rungs).toStrictEqual([]);
        expect(first.kind).toBe(NextTradeKind.Stop);
    });

    it('hard-codes no cent in CopyGroupSizing.ts', () => {
        const text = readFileSync(
            path.resolve(
                import.meta.dirname,
                '../../../../../src/lib/prop-calculator/advisor/CopyGroupSizing.ts',
            ),
            'utf8',
        );

        expect(text).not.toContain('ONE_CENT');
    });
});
