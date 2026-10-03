import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ConsistencyRule,
    ConsistencyScope,
    dollars,
    findFirm,
    FirmId,
    fraction,
    type FundedCycleTracker,
    newFundedCycleTracker,
    ONE_CENT,
    PayoutGate,
    type Plan,
    type PlanId,
    serializePlanId,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AccountAction,
    ConsistencyCeilingNote,
    dailyPlanCard,
    DayStopReason,
    DEFAULT_RULEBOOK,
    fundedConsistencyCeiling,
    fundedConsistencyNote,
    FundedFixedRiskRule,
    type FundedRuleContext,
    FundedSizingAdvisor,
    NO_PENDING_PAYOUT_COUNTS,
    NO_PERSONAL_CAPS,
    payoutBlockReasonFromGate,
    PayoutReadinessKind,
    type ReconstructedFundedOrEvalAccount,
    SizingConstraint,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import { accountActionOf } from '~/lib/prop-calculator/advisor/actions';

const TOPSTEP_STANDARD_CONSISTENCY_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardConsistency,
};

const CYCLE_PROFIT = 400;
const BLOCKED_READINESS = {
    kind: PayoutReadinessKind.Blocked as const,
    reason: payoutBlockReasonFromGate(PayoutGate.FundedConsistency),
    wait: null,
};

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

const consistencyPlan = registryPlan(TOPSTEP_STANDARD_CONSISTENCY_ID);

function accountWith(
    cycleProfit: number,
    bestDayProfit: number,
    plan: Plan = consistencyPlan,
): ReconstructedFundedOrEvalAccount {
    const state: AccountState = {
        balance: 50_000 + cycleProfit,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 20,
        startingBalance: 50_000,
        threshold: 48_000,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 20,
    };
    const tracker: FundedCycleTracker = newFundedCycleTracker({
        ...state,
        balance: state.startingBalance,
    });
    tracker.cycleBestDayProfit = bestDayProfit;
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: tracker,
        kind: TradingPhase.Funded,
        plan,
        resolvedDailyLossLimit: null,
        state,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function advisorFor(
    account: ReconstructedFundedOrEvalAccount,
): FundedSizingAdvisor {
    return new FundedSizingAdvisor({
        account,
        fundedHorizonDays: 252,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
    });
}

function fundedContext(
    overrides: Partial<FundedRuleContext> = {},
): FundedRuleContext {
    return {
        ceiling: null,
        contractLimit: null,
        cushion: dollars(3000),
        dayStartDllRoom: null,
        instrument: null,
        personalCaps: NO_PERSONAL_CAPS,
        personalDll: null,
        placeableMinimum: ONE_CENT,
        stage: SizingStage.Funded,
        ...overrides,
    };
}

describe('the funded consistency ceiling uses the cycle best day (PT-105 step 4, F-146, F-154)', () => {
    it('says the payout is already pushed out when the best day of 300 is above what a 40% rule dilutes at a cycle profit of 400', () => {
        const account = accountWith(CYCLE_PROFIT, 300);
        const formulaCeiling = consistencyPlan
            .fundedConsistencyRule(0)
            ?.maxDayProfitBeforeViolation(CYCLE_PROFIT);
        expect(formulaCeiling).toBeCloseTo(266.67, 2);

        expect(fundedConsistencyCeiling(account)).toBeNull();
        expect(fundedConsistencyNote(account)).toBe(
            ConsistencyCeilingNote.AlreadyPushedOut,
        );
    });

    it('does not cap the card rungs at an unreachable ceiling and names the pushed-out note', () => {
        const card = advisorFor(accountWith(CYCLE_PROFIT, 300)).dailyPlanCard();

        expect(card?.consistencyNote).toBe(
            ConsistencyCeilingNote.AlreadyPushedOut,
        );
        expect(card?.profitCeiling).toBeNull();
        expect(card?.rungs.map((rung) => rung.risk)).toStrictEqual([
            250, 250, 250, 250,
        ]);
        expect(card?.rungs.flatMap((rung) => rung.cappedBy)).toStrictEqual([]);
    });

    it('still gives the formula ceiling of 266.67 and caps the rungs when the best day is 100', () => {
        const account = accountWith(CYCLE_PROFIT, 100);

        expect(fundedConsistencyCeiling(account)).toBeCloseTo(266.67, 2);
        expect(fundedConsistencyNote(account)).toBeNull();

        const card = advisorFor(account).dailyPlanCard();
        expect(card?.consistencyNote).toBeNull();
        expect(card?.profitCeiling?.constraint).toBe(
            SizingConstraint.ConsistencyCap,
        );
        expect(card?.profitCeiling?.amount).toBeCloseTo(266.67, 2);
        expect(card?.rungs[0]?.risk).toBeCloseTo(133.33, 2);
        expect(card?.rungs[0]?.cappedBy).toContain(
            SizingConstraint.ConsistencyCap,
        );
    });

    it('treats a best day equal to the ceiling as not pushed out', () => {
        const rule = consistencyPlan.fundedConsistencyRule(0);
        const ceiling = rule?.maxDayProfitBeforeViolation(CYCLE_PROFIT);
        if (ceiling === undefined) throw new Error('expected a rule');
        const account = accountWith(CYCLE_PROFIT, ceiling);

        expect(fundedConsistencyCeiling(account)).toBe(ceiling);
        expect(fundedConsistencyNote(account)).toBeNull();
    });

    it('names a 40% consistency ceiling on a $600 cycle ConsistencyCap with rung 200 and take profit 400 (today CeilingCap)', () => {
        const card = advisorFor(accountWith(600, 0)).dailyPlanCard();

        expect(card?.profitCeiling).toEqual({
            amount: 400,
            constraint: SizingConstraint.ConsistencyCap,
        });
        expect(card?.rungs[0]?.risk).toBe(200);
        expect(card?.rungs[0]?.takeProfit).toBe(400);
        expect(card?.rungs[0]?.cappedBy).toContain(
            SizingConstraint.ConsistencyCap,
        );
        expect(card?.rungs[0]?.cappedBy).not.toContain(
            SizingConstraint.CeilingCap,
        );
    });
});

describe('a fresh cycle is not an early exit (PT-105 step 5, F-146, F-154, QF-1)', () => {
    it('gives no ceiling and the fresh-cycle note at a cycle profit of 0', () => {
        const account = accountWith(0, 0);

        expect(fundedConsistencyCeiling(account)).toBeNull();
        expect(fundedConsistencyNote(account)).toBe(
            ConsistencyCeilingNote.FreshCycle,
        );
    });

    it('gives no ceiling and the fresh-cycle note at a net-losing cycle', () => {
        const account = accountWith(-200, 0);

        expect(fundedConsistencyCeiling(account)).toBeNull();
        expect(fundedConsistencyNote(account)).toBe(
            ConsistencyCeilingNote.FreshCycle,
        );
    });

    it('keeps the documented rungs on a fresh cycle and carries the typed note', () => {
        const card = advisorFor(accountWith(0, 0)).dailyPlanCard();

        expect(card?.rungs.map((rung) => rung.risk)).toStrictEqual([
            250, 250, 250, 250,
        ]);
        expect(card?.stopReason).toBe(DayStopReason.MaxTrades);
        expect(card?.profitCeiling).toBeNull();
        expect(card?.consistencyNote).toBe(ConsistencyCeilingNote.FreshCycle);
    });

    it('never tells a trader on a consistency plan to stop for today on a fresh cycle', () => {
        const advice = advisorFor(accountWith(0, 0)).assemble([]);

        const result = accountActionOf(advice, BLOCKED_READINESS, null, {
            retireOnSwitchBeatsKeep: false,
        });

        expect(result.action).toBe(AccountAction.Trade);
        expect(result.action).not.toBe(AccountAction.StopForToday);
    });

    it('still stops the day on a trigger ceiling of 0 on a fresh cycle', () => {
        const card = dailyPlanCard(
            new FundedFixedRiskRule(DEFAULT_RULEBOOK),
            fundedContext({
                ceiling: dollars(0),
                consistencyNote: ConsistencyCeilingNote.FreshCycle,
            }),
        );

        expect(card.rungs).toStrictEqual([]);
        expect(card.stopReason).toBe(DayStopReason.CeilingReached);
        expect(card.stopCappedBy).toStrictEqual([SizingConstraint.CeilingCap]);
        expect(card.consistencyNote).toBe(ConsistencyCeilingNote.FreshCycle);
    });

    it('still stops the day when a personal daily profit cap leaves no room', () => {
        const card = dailyPlanCard(
            new FundedFixedRiskRule(DEFAULT_RULEBOOK),
            fundedContext({
                consistencyNote: ConsistencyCeilingNote.FreshCycle,
                personalCaps: {
                    ...NO_PERSONAL_CAPS,
                    dailyProfitCap: dollars(0.005),
                },
            }),
        );

        expect(card.rungs).toStrictEqual([]);
        expect(card.stopReason).toBe(DayStopReason.CeilingReached);
    });
});

describe('plans with no funded consistency limit carry no ceiling and no note', () => {
    it('gives nothing for a plan without a funded consistency rule', () => {
        const plan = consistencyPlan.withOverrides({
            fundedConsistency: { kind: 'set', rule: null },
        });
        const account = accountWith(CYCLE_PROFIT, 300, plan);

        expect(fundedConsistencyCeiling(account)).toBeNull();
        expect(fundedConsistencyNote(account)).toBeNull();
    });

    it('gives nothing when the rule allows a best day of the whole cycle (share of 1)', () => {
        const plan = consistencyPlan.withOverrides({
            fundedConsistency: {
                kind: 'set',
                rule: new ConsistencyRule(ConsistencyScope.Funded, fraction(1)),
            },
        });

        for (const cycleProfit of [0, CYCLE_PROFIT]) {
            const account = accountWith(cycleProfit, 300, plan);
            expect(fundedConsistencyCeiling(account)).toBeNull();
            expect(fundedConsistencyNote(account)).toBeNull();
        }
    });

    it('gives nothing for an account with no funded tracker', () => {
        const account = {
            ...accountWith(CYCLE_PROFIT, 300),
            fundedTracker: null,
        };

        expect(fundedConsistencyCeiling(account)).toBeNull();
        expect(fundedConsistencyNote(account)).toBeNull();
    });
});
