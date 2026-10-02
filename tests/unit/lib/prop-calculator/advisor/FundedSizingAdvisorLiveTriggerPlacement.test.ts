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
    DayStopReason,
    DEFAULT_RULEBOOK,
    FundedSizingAdvisor,
    type ReconstructedFundedOrEvalAccount,
    SizingConstraint,
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

function advisorWith(
    triggerAmount: number,
    positionSizing: {
        readonly instrument: InstrumentSymbol;
        readonly stopPoints: number;
    },
): FundedSizingAdvisor {
    const plan = registryPlan(MFF_PRO_ID);
    const tracker = newFundedCycleTracker({
        ...state,
        balance: state.startingBalance,
    });
    const account: ReconstructedFundedOrEvalAccount = {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: tracker,
        kind: TradingPhase.Funded,
        plan,
        resolvedDailyLossLimit: null,
        state,
    };
    const trigger = new SingleDayProfitTrigger(
        dollars(triggerAmount),
        true,
        false,
        CONFIRMED_SOURCE,
    );
    return new FundedSizingAdvisor({
        account,
        accountPolicy: new StubTriggerPolicy([trigger]),
        fundedHorizonDays: 252,
        positionSizing,
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

describe('FundedSizingAdvisor: a verified single-day trigger and whole contracts (PT-36f, steps 1 and 2)', () => {
    const flatRisk = DEFAULT_RULEBOOK.funded.riskCents / 100;

    it('keeps the flat rung and never reports no loss room when the trigger does not bind and one contract costs more than the flat risk', () => {
        const card = advisorWith(10_000, {
            instrument: InstrumentSymbol.NQ,
            stopPoints: 20,
        }).dailyPlanCard();

        expect(card?.stopReason).toBe(DayStopReason.MaxTrades);
        expect(card?.rungs.map((rung) => rung.risk)).toStrictEqual([
            flatRisk,
            flatRisk,
            flatRisk,
            flatRisk,
        ]);
        expect(card?.rungs[0]?.cappedBy).not.toContain(
            SizingConstraint.CeilingCap,
        );
    });

    it('rounds a trigger-capped rung down to whole contracts at the entered stop ($100 of room at a $40 contract is $80)', () => {
        const card = advisorWith(250, {
            instrument: InstrumentSymbol.MNQ,
            stopPoints: 20,
        }).dailyPlanCard();

        expect(card?.rungs[0]?.risk).toBe(80);
        expect(card?.rungs[0]?.cappedBy).toContain(SizingConstraint.CeilingCap);
    });

    it('places every trigger-capped rung of the day as a whole number of contracts', () => {
        const card = advisorWith(250, {
            instrument: InstrumentSymbol.MNQ,
            stopPoints: 20,
        }).dailyPlanCard();
        const capped = (card?.rungs ?? []).filter((rung) =>
            rung.cappedBy.includes(SizingConstraint.CeilingCap),
        );

        expect(capped.length).toBeGreaterThan(0);
        for (const rung of capped) {
            expect(rung.risk % 40).toBe(0);
        }
    });

    it('keeps the trigger-capped rung at whole cents without an entered stop', () => {
        const advisor = advisorWith(250, {
            instrument: InstrumentSymbol.MNQ,
            stopPoints: 0,
        });

        expect(advisor.dailyPlanCard()?.rungs[0]?.risk).toBe(100);
    });
});
