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
    PayoutCountPerAccountTrigger,
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
    AssumptionKind,
    DEFAULT_RULEBOOK,
    FundedSizingAdvisor,
    NextTradeRiskVerdict,
    NO_PENDING_PAYOUT_COUNTS,
    type ReconstructedFundedOrEvalAccount,
    runEngineOptimum,
    RungPlacement,
    rungPlacementOf,
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

const NEEDS_PASTE_SOURCE = {
    verification: PolicyVerification.NeedsPaste,
} as const;

const NQ_AT_20_POINTS = {
    instrument: InstrumentSymbol.NQ,
    stopPoints: 20,
} as const;

const MNQ_AT_20_POINTS = {
    instrument: InstrumentSymbol.MNQ,
    stopPoints: 20,
} as const;

const FIRST_TRADE_OF_THE_DAY = {
    dayPnL: dollars(0),
    losses: 0,
    runningLoss: dollars(0),
    wins: 0,
};

const ENGINE_DISCLOSURE_TRIALS = 20;

const STATE: AccountState = {
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

class StubTriggerPolicy extends FirmAccountPolicy {
    constructor(private readonly triggers: readonly LiveTransitionTrigger[]) {
        super();
    }

    override liveTriggersFor(): readonly LiveTransitionTrigger[] {
        return this.triggers;
    }
}

function advisorWith(
    options: {
        readonly accountPolicy?: FirmAccountPolicy;
        readonly paidPayoutsSinceLastLiveAccount?: number;
        readonly positionSizing?: {
            readonly instrument: InstrumentSymbol;
            readonly stopPoints: number;
        };
        readonly trials?: number;
    } = {},
): FundedSizingAdvisor {
    const plan = registryPlan();
    const account: ReconstructedFundedOrEvalAccount = {
        assumptions: [],
        contractLimit: null,
        cushion: STATE.balance - STATE.threshold,
        fundedTracker: newFundedCycleTracker({
            ...STATE,
            balance: STATE.startingBalance,
        }),
        kind: TradingPhase.Funded,
        plan,
        resolvedDailyLossLimit: null,
        state: STATE,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
    return new FundedSizingAdvisor({
        account,
        fundedHorizonDays: 252,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
        ...options,
    });
}

function enginePolicyAdvice(advisor: FundedSizingAdvisor) {
    const [request] = advisor.optimumRequests();
    if (request === undefined) throw new Error('expected a request');
    const result = runEngineOptimum(registryPlan(), request);
    return advisor.assemble([result]);
}

function hasNotCheckedAssumption(
    assumptions: readonly { readonly kind: AssumptionKind }[],
): boolean {
    return assumptions.some(
        (assumption) =>
            assumption.kind === AssumptionKind.LiveTriggersNotChecked,
    );
}

function registryPlan(): Plan {
    const found = findFirm(MFF_PRO_ID.firm)?.findPlan(MFF_PRO_ID);
    if (!found) throw new Error(`${serializePlanId(MFF_PRO_ID)} missing`);
    return found;
}

describe('the advisor passes the entered stop to the daily card (PT-36j, F-154)', () => {
    it('flags every documented rung below one contract in the card and in the advice', () => {
        const advisor = advisorWith({ positionSizing: NQ_AT_20_POINTS });

        const card = advisor.dailyPlanCard();
        const adviceCard = advisor.assemble([]).dailyPlanCard;

        expect(card?.rungs.length).toBeGreaterThan(0);
        expect(card?.rungPlacements).toEqual(
            card?.rungs.map(() => RungPlacement.BelowOneContract),
        );
        expect(adviceCard?.rungPlacements).toEqual(card?.rungPlacements);
    });

    it('marks the rungs placeable when one contract at the entered stop fits inside them', () => {
        const card = advisorWith({
            positionSizing: MNQ_AT_20_POINTS,
        }).dailyPlanCard();

        expect(card?.rungs.length).toBeGreaterThan(0);
        expect(card?.rungPlacements).toEqual(
            card?.rungs.map(() => RungPlacement.Placeable),
        );
    });

    it('leaves every rung not checked while no stop is entered', () => {
        const card = advisorWith().dailyPlanCard();

        expect(card?.rungs.length).toBeGreaterThan(0);
        expect(card?.rungPlacements).toEqual(
            card?.rungs.map(() => RungPlacement.NotChecked),
        );
    });

    it('serialises the typed flag into the advice JSON', () => {
        const advice = advisorWith({
            positionSizing: NQ_AT_20_POINTS,
        }).assemble([]);

        const json = JSON.stringify(advice);

        expect(json).toContain(
            `"rungPlacements":["${RungPlacement.BelowOneContract}"`,
        );
    });
});

describe('the advisor passes the entered stop to the next-trade risk check (PT-36j, F-154)', () => {
    it('carries the below-one-contract flag on the documented rung', () => {
        const result = advisorWith({
            positionSizing: NQ_AT_20_POINTS,
        }).checkNextTradeRisk(dollars(200), FIRST_TRADE_OF_THE_DAY);

        expect(result?.verdict).toBe(NextTradeRiskVerdict.WithinPlan);
        expect(result?.documentedRungPlacement).toBe(
            RungPlacement.BelowOneContract,
        );
    });

    it('carries the placeable flag when one contract fits', () => {
        const result = advisorWith({
            positionSizing: MNQ_AT_20_POINTS,
        }).checkNextTradeRisk(dollars(200), FIRST_TRADE_OF_THE_DAY);

        expect(result?.documentedRungPlacement).toBe(RungPlacement.Placeable);
    });

    it('leaves the flag not checked without an entered stop', () => {
        const result = advisorWith().checkNextTradeRisk(
            dollars(200),
            FIRST_TRADE_OF_THE_DAY,
        );

        expect(result?.documentedRungPlacement).toBe(RungPlacement.NotChecked);
    });
});

describe('the advisor barrel exports the placement names (PT-36j)', () => {
    it('exports RungPlacement and rungPlacementOf', () => {
        expect(RungPlacement.BelowOneContract).toBe('below-one-contract');
        expect(rungPlacementOf(250, NQ_AT_20_POINTS)).toBe(
            RungPlacement.BelowOneContract,
        );
        expect(rungPlacementOf(250, null)).toBe(RungPlacement.NotChecked);
    });
});

describe('no trigger is called both enforced and not checked (PT-36j, F-145)', () => {
    it('drops the assumption from the advice and the payout advice when every trigger is a verified per-account count the engine models', () => {
        const advisor = advisorWith({
            accountPolicy: new StubTriggerPolicy([
                new PayoutCountPerAccountTrigger(3, CONFIRMED_SOURCE),
            ]),
            trials: ENGINE_DISCLOSURE_TRIALS,
        });

        const advice = enginePolicyAdvice(advisor);

        expect(advice.optima.length).toBeGreaterThan(0);
        expect(hasNotCheckedAssumption(advice.assumptions)).toBe(false);
        expect(
            hasNotCheckedAssumption(advice.payoutAdvice?.assumptions ?? []),
        ).toBe(false);
    });

    it('keeps the engine-number disclosure on the optima under a verified single-day trigger the engine ignores, while the payout advice drops it', () => {
        const trigger = new SingleDayProfitTrigger(
            dollars(1000),
            true,
            false,
            CONFIRMED_SOURCE,
        );
        const advisor = advisorWith({
            accountPolicy: new StubTriggerPolicy([trigger]),
            trials: ENGINE_DISCLOSURE_TRIALS,
        });

        const advice = enginePolicyAdvice(advisor);

        expect(advice.optima.length).toBeGreaterThan(0);
        expect(hasNotCheckedAssumption(advice.assumptions)).toBe(true);
        expect(
            hasNotCheckedAssumption(advice.payoutAdvice?.assumptions ?? []),
        ).toBe(false);
    });

    it('keeps the engine-number disclosure on the optima under a verified firm-total payout count the engine ignores, while the payout advice drops it', () => {
        const advisor = advisorWith({
            accountPolicy: new StubTriggerPolicy([
                new PayoutCountTotalTrigger(6, CONFIRMED_SOURCE),
            ]),
            paidPayoutsSinceLastLiveAccount: 2,
            trials: ENGINE_DISCLOSURE_TRIALS,
        });

        const advice = enginePolicyAdvice(advisor);

        expect(advice.optima.length).toBeGreaterThan(0);
        expect(hasNotCheckedAssumption(advice.assumptions)).toBe(true);
        expect(
            hasNotCheckedAssumption(advice.payoutAdvice?.assumptions ?? []),
        ).toBe(false);
    });

    it('keeps the assumption while a trigger is unverified', () => {
        const advisor = advisorWith({
            accountPolicy: new StubTriggerPolicy([
                new PayoutCountPerAccountTrigger(3, NEEDS_PASTE_SOURCE),
            ]),
        });

        const advice = advisor.assemble([]);

        const payoutAssumptions = advice.payoutAdvice?.assumptions ?? [];

        expect(hasNotCheckedAssumption(advice.assumptions)).toBe(true);
        expect(hasNotCheckedAssumption(payoutAssumptions)).toBe(true);
    });

    it('keeps the assumption when the firm has no account policy', () => {
        const advice = advisorWith().assemble([]);

        expect(hasNotCheckedAssumption(advice.assumptions)).toBe(true);
    });
});
