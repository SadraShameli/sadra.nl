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
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    DayStopReason,
    DEFAULT_RULEBOOK,
    DifferenceReason,
    FundedSizingAdvisor,
    type ReconstructedFundedOrEvalAccount,
    SizingConstraint,
} from '~/lib/prop-calculator/advisor';

const MFF_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
};

const TOPSTEP_CONSISTENCY_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardConsistency,
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

function accountOf(
    plan: Plan,
    accountState: AccountState,
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
        plan,
        resolvedDailyLossLimit: null,
        state: accountState,
    };
}

function advisorWithTrigger(
    triggerAmount: number,
    positionSizing: {
        readonly instrument: InstrumentSymbol;
        readonly stopPoints: number;
    },
): FundedSizingAdvisor {
    const trigger = new SingleDayProfitTrigger(
        dollars(triggerAmount),
        true,
        false,
        CONFIRMED_SOURCE,
    );
    return new FundedSizingAdvisor({
        account: accountOf(registryPlan(MFF_PRO_ID), state),
        accountPolicy: new StubTriggerPolicy([trigger]),
        fundedHorizonDays: 252,
        positionSizing,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
    });
}

function consistencyAdvisor(
    positionSizing?: typeof NQ_AT_20_POINTS | { instrument: InstrumentSymbol; stopPoints: number },
): FundedSizingAdvisor {
    return new FundedSizingAdvisor({
        account: accountOf(registryPlan(TOPSTEP_CONSISTENCY_ID), {
            ...state,
            balance: 50_600,
            threshold: 48_000,
            thresholdLocked: false,
        }),
        fundedHorizonDays: 252,
        ...(positionSizing !== undefined && { positionSizing }),
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
    });
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

describe('FundedSizingAdvisor: a verified trigger room between the flat rung and one contract (PT-36f review)', () => {
    const flatRisk = DEFAULT_RULEBOOK.funded.riskCents / 100;

    it.each([550, 650, 750])(
        'keeps the flat rung and stops on max trades under a $%d trigger at NQ 20 points',
        (triggerAmount) => {
            const card = advisorWithTrigger(
                triggerAmount,
                NQ_AT_20_POINTS,
            ).dailyPlanCard();

            expect(card?.stopReason).toBe(DayStopReason.MaxTrades);
            expect(card?.rungs.map((rung) => rung.risk)).toStrictEqual([
                flatRisk,
                flatRisk,
                flatRisk,
                flatRisk,
            ]);
        },
    );

    it('still stops with the ceiling when the trigger room is below the flat rung and below one contract', () => {
        const card = advisorWithTrigger(450, NQ_AT_20_POINTS).dailyPlanCard();

        expect(card?.stopReason).toBe(DayStopReason.CeilingReached);
        expect(card?.rungs).toStrictEqual([]);
    });

    it('gives the same card as a firm with no trigger when the trigger does not bind', () => {
        const withTrigger = advisorWithTrigger(650, NQ_AT_20_POINTS);

        const nonBinding = advisorWithTrigger(10_000, NQ_AT_20_POINTS);

        expect(withTrigger.dailyPlanCard()?.rungs).toStrictEqual(
            nonBinding.dailyPlanCard()?.rungs,
        );
    });
});

describe('FundedSizingAdvisor: a rung below one contract stays disclosed on the advice (PT-36f review)', () => {
    it('keeps the flat rung on the card and says in the advice that it places below one contract at the entered stop', () => {
        const advisor = advisorWithTrigger(650, NQ_AT_20_POINTS);

        const { differenceReasons } = advisor.assemble([]);
        const belowOneContract = differenceReasons.filter(
            (reason) =>
                reason.kind === DifferenceReason.EngineInputsRefused &&
                reason.issue.includes('below one contract'),
        );

        expect(advisor.dailyPlanCard()?.rungs[0]?.risk).toBe(250);
        expect(belowOneContract).toHaveLength(1);
    });
});

describe('FundedSizingAdvisor: the funded-consistency ceiling alone rounds to whole contracts (PT-36f review)', () => {
    it('rounds the ceiling-capped rung down to whole contracts at an entered MNQ stop (400 of ceiling is $200 of risk, $180 at $60 a contract)', () => {
        const card = consistencyAdvisor({
            instrument: InstrumentSymbol.MNQ,
            stopPoints: 30,
        }).dailyPlanCard();

        expect(card?.rungs[0]?.risk).toBe(180);
        expect(card?.rungs[0]?.cappedBy).toContain(SizingConstraint.CeilingCap);
    });

    it('leaves the ceiling-capped rung at whole cents without an entered stop', () => {
        expect(consistencyAdvisor().dailyPlanCard()?.rungs[0]?.risk).toBe(200);
    });
});
