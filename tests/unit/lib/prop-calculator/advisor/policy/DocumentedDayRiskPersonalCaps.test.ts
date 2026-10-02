import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    type ComputeRisk,
    type Dollars,
    dollars,
    FirmId,
    InstrumentSymbol,
    type Plan,
    type PlanId,
    policySizingOf,
    resolvePositionSizing,
    resolveRiskAt,
    RungSizing,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    createDocumentedRule,
    DEFAULT_RULEBOOK,
    NO_PERSONAL_CAPS,
    type PersonalCaps,
    type PlanPhaseStage,
    ruleContextAt,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import {
    documentedDayRisk,
    type EnginePolicy,
    LifetimePayoutCapBasis,
    RebuyLagBasis,
} from '~/lib/prop-calculator/advisor/policy';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';

function registryPlan(id: PlanId): Plan {
    const firm = ALL_FIRMS.find((candidate) => candidate.id === id.firm);
    const plan = firm?.findPlan(id);
    if (!plan) throw new Error(`registry plan ${JSON.stringify(id)} not found`);
    return plan;
}

const apexIntraday = registryPlan({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Intraday,
});
const apexEod = registryPlan({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
});

const BASE_POLICY: EnginePolicy = {
    commissionPerRoundTrip: 0,
    fundedHorizonDays: 60,
    lifetimePayoutCapBasis: LifetimePayoutCapBasis.LiveTriggersNotChecked,
    lifetimePayoutCapOverride: null,
    payoutRequestOverride: null,
    rebuyLagBasis: RebuyLagBasis.AssumedZero,
    rebuyLagDays: 0,
    retainedCushionRequest: null,
};

interface PersonalLimitsInput {
    readonly caps?: Partial<PersonalCaps>;
    readonly dll?: Dollars | null;
}

interface PlacedFundedDay {
    readonly highest: number;
    readonly lowest: number;
    readonly placed: number;
}

function allLossDay(risk: ComputeRisk, state: AccountState): number[] {
    const risks: number[] = [];
    for (
        let index = 0;
        index < DEFAULT_RULEBOOK.strategy.tradesPerDayMax;
        index++
    ) {
        const next = risk(state, index);
        if (next <= 0) break;
        risks.push(next);
        state.balance -= next;
        state.todayPnL -= next;
    }
    return risks;
}

function fundedStateOf(): AccountState {
    const state = apexEod.initialState();
    apexEod.beginFundedPhase(state);
    return state;
}

function placedFundedDay(
    limits: PersonalLimitsInput,
    isWin: boolean,
): PlacedFundedDay {
    const risk = documentedDayRisk(
        apexEod,
        SizingStage.Funded,
        DEFAULT_RULEBOOK,
        {
            ...policyWith(limits),
            instrument: InstrumentSymbol.NQ,
            stopPoints: 10,
        },
    );
    const positionSizing = resolvePositionSizing(InstrumentSymbol.NQ, 10);
    const state = fundedStateOf();
    let highest = 0;
    let lowest = 0;
    let placed = 0;
    for (let index = 0; index < 20; index++) {
        const { rewardRisk, risk: placedRisk } = resolveRiskAt({
            commission: 0,
            intendedRisk: risk(state, index),
            phase: TradingPhase.Funded,
            plan: apexEod,
            positionSizing,
            rungSizing: RungSizing.CapToCushion,
            sizing: policySizingOf(TradingPhase.Funded),
            state,
        });
        if (placedRisk <= 0) break;
        const pnl = isWin
            ? DEFAULT_RULEBOOK.strategy.rr * rewardRisk
            : -placedRisk;
        state.balance += pnl;
        state.todayPnL += pnl;
        placed += 1;
        highest = Math.max(highest, state.todayPnL);
        lowest = Math.min(lowest, state.todayPnL);
    }
    return { highest, lowest, placed };
}

function policyWith(limits: PersonalLimitsInput): EnginePolicy {
    return {
        ...BASE_POLICY,
        personalCaps: { ...NO_PERSONAL_CAPS, ...limits.caps },
        personalDll: limits.dll ?? null,
    };
}

function ruleRungs(
    plan: Plan,
    stage: PlanPhaseStage,
    state: AccountState,
    limits: PersonalLimitsInput,
): number[] {
    const rule = createDocumentedRule(stage, DEFAULT_RULEBOOK);
    const context = ruleContextAt(plan, stage, state, {
        instrument: null,
        personalCaps: { ...NO_PERSONAL_CAPS, ...limits.caps },
        personalDll: limits.dll ?? null,
    });
    return rule.size(context).rungs.map((rung) => rung.risk);
}

describe('documentedDayRisk applies the personal caps the advice panel applies (PT-68f, F-V16)', () => {
    it('caps every eval rung at the personal max risk per trade: a $150 cap under the $400 first rung trades [150, 150, 150, 100]', () => {
        const limits = { caps: { maxRiskPerTrade: dollars(150) } };
        const risk = documentedDayRisk(
            apexIntraday,
            SizingStage.Eval,
            DEFAULT_RULEBOOK,
            policyWith(limits),
        );

        expect(allLossDay(risk, apexIntraday.initialState())).toEqual([
            150, 150, 150, 100,
        ]);
        expect(
            ruleRungs(
                apexIntraday,
                SizingStage.Eval,
                apexIntraday.initialState(),
                limits,
            ),
        ).toEqual([150, 150, 150, 100]);
    });

    it('stops the eval day at the personal max trades per day', () => {
        const limits = { caps: { maxTradesPerDay: 2 } };
        const risk = documentedDayRisk(
            apexIntraday,
            SizingStage.Eval,
            DEFAULT_RULEBOOK,
            policyWith(limits),
        );

        expect(allLossDay(risk, apexIntraday.initialState())).toEqual([
            400, 600,
        ]);
    });

    it('applies the daily profit cap to the eval rungs exactly as the rule does', () => {
        const limits = { caps: { dailyProfitCap: dollars(300) } };
        const risk = documentedDayRisk(
            apexIntraday,
            SizingStage.Eval,
            DEFAULT_RULEBOOK,
            policyWith(limits),
        );

        const simulated = allLossDay(risk, apexIntraday.initialState());

        expect(simulated).toEqual(
            ruleRungs(
                apexIntraday,
                SizingStage.Eval,
                apexIntraday.initialState(),
                limits,
            ),
        );
        expect(simulated[0]).toBeLessThan(400);
    });

    it('applies the personal daily loss limit to the eval rungs exactly as the rule does', () => {
        const limits = { dll: dollars(600) };
        const risk = documentedDayRisk(
            apexIntraday,
            SizingStage.Eval,
            DEFAULT_RULEBOOK,
            policyWith(limits),
        );

        const simulated = allLossDay(risk, apexIntraday.initialState());

        expect(simulated).toEqual(
            ruleRungs(
                apexIntraday,
                SizingStage.Eval,
                apexIntraday.initialState(),
                limits,
            ),
        );
        expect(
            simulated.reduce((sum, next) => sum + next, 0),
        ).toBeLessThanOrEqual(600);
    });

    it('caps the funded flat risk at the personal max risk per trade', () => {
        const risk = documentedDayRisk(
            apexEod,
            SizingStage.Funded,
            DEFAULT_RULEBOOK,
            policyWith({ caps: { maxRiskPerTrade: dollars(100) } }),
        );

        expect(allLossDay(risk, fundedStateOf())).toEqual([100, 100, 100, 100]);
    });

    it('stops the funded day at the personal max trades per day', () => {
        const risk = documentedDayRisk(
            apexEod,
            SizingStage.Funded,
            DEFAULT_RULEBOOK,
            policyWith({ caps: { maxTradesPerDay: 2 } }),
        );

        expect(allLossDay(risk, fundedStateOf())).toEqual([250, 250]);
    });

    it('applies the personal daily loss limit to the funded rungs', () => {
        const limits = { dll: dollars(400) };
        const risk = documentedDayRisk(
            apexEod,
            SizingStage.Funded,
            DEFAULT_RULEBOOK,
            policyWith(limits),
        );

        const simulated = allLossDay(risk, fundedStateOf());

        expect(simulated).toEqual(
            ruleRungs(apexEod, SizingStage.Funded, fundedStateOf(), limits),
        );
        expect(simulated).toEqual([250, 150]);
    });

    it('leaves the rungs untouched when the policy carries no personal limits', () => {
        const risk = documentedDayRisk(
            apexIntraday,
            SizingStage.Eval,
            DEFAULT_RULEBOOK,
            BASE_POLICY,
        );

        expect(allLossDay(risk, apexIntraday.initialState())).toEqual([
            400, 600, 900, 100,
        ]);
    });
});
describe('documentedDayRisk keeps a funded day inside the personal limits with a stop in points (PT-68h, F-V16)', () => {
    it('places no losing trade that takes the day past the personal daily loss limit', () => {
        const day = placedFundedDay({ dll: dollars(300) }, false);

        expect(-day.lowest).toBeLessThanOrEqual(300);
        expect(day.placed).toBeGreaterThan(0);
    });

    it('places no winning trade that takes the day past the personal daily profit cap', () => {
        const cap = 1000;
        const day = placedFundedDay(
            { caps: { dailyProfitCap: dollars(cap) } },
            true,
        );

        expect(day.highest).toBeLessThanOrEqual(cap);
        expect(day.placed).toBeGreaterThan(0);
    });
});
