import { describe, expect, it, vi } from 'vitest';

import {
    computeEvalStateValue,
    ConsistencyBasis,
    ConsistencyBoundary,
    ConsistencyRule,
    ConsistencyScope,
    ConsistencyViolationEffect,
    DailyLossLimitKind,
    DayStopRuleKind,
    dollars,
    EodTrailingDrawdown,
    type EvalStateValueConfig,
    FirmId,
    fraction,
    type Plan,
    TopStepVariant,
} from '~/lib/prop-calculator/core';
import { TopStep } from '~/lib/prop-calculator/firms/topstep/TopStep';

import { baseBuilderPlan, toyDpConfig, toyPlan } from '../evalStateValueToy';

interface EvalGolden {
    readonly initialValue: number;
    readonly passProbability: number;
    readonly reachedStateCount: number;
    readonly risks: readonly number[];
}

const TOP_STEP_ACTION_STEP_DOLLARS = 250;
const TOP_STEP_EVAL_DAYS = 4;
const TOP_STEP_PROFIT_STEP_DOLLARS = 300;
const TRADES_PER_DAY = 3;
const SHARING_TOY_DAYS = 12;
const SHARING_TOY_MAX_ACTION_DOLLARS = 100;
const PRE_TOPOLOGY_BASE_AFFORDABLE_RISK_CALLS = 31_302;
const BASE_AFFORDABLE_RISK_REDUCTION = 20;
const SHARING_TOY_STATE_SHARE = 50;

function consistencyPlan(): Plan {
    return stepPlan({
        consistency: new ConsistencyRule(
            ConsistencyScope.Eval,
            fraction(0.5),
            ConsistencyBasis.Cycle,
            ConsistencyViolationEffect.DoubleTarget,
            ConsistencyBoundary.Inclusive,
        ),
    });
}

function lockingPlan(): Plan {
    return stepPlan({
        drawdown: new EodTrailingDrawdown({
            amount: dollars(2000),
            lock: {
                atProfit: dollars(2000),
                lockedThreshold: () => 50_000,
            },
        }),
    });
}

function stepConfig(
    plan: Plan,
    overrides: Partial<EvalStateValueConfig> = {},
): EvalStateValueConfig {
    return {
        actionStepDollars: 200,
        maxEvalDays: 5,
        plan,
        profitStepDollars: 300,
        rrRatio: 2,
        tradesPerDay: TRADES_PER_DAY,
        winrate: fraction(0.4),
        ...overrides,
    };
}

function stepPlan(overrides: Record<string, unknown> = {}): Plan {
    return baseBuilderPlan().withOverrides({
        accountSize: dollars(50_000),
        consistency: null,
        contractLimits: undefined,
        drawdown: new EodTrailingDrawdown({ amount: dollars(2000) }),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        evalMaxConsecutiveIdleDays: 3,
        maxEvalTradingDays: undefined,
        minTradingDays: 2,
        profitTarget: dollars(3000),
        ...overrides,
    });
}

const SCENARIOS: readonly {
    readonly build: () => EvalStateValueConfig;
    readonly golden: EvalGolden;
    readonly name: string;
}[] = [
    {
        build: () => stepConfig(stepPlan()),
        golden: {
            initialValue: 0.5224969578741762,
            passProbability: 0.5224969578741762,
            reachedStateCount: 1884,
            risks: [800, 400, 200, 0],
        },
        name: 'a plain EOD trailing plan with no daily loss limit',
    },
    {
        build: () =>
            stepConfig(stepPlan(), {
                actionStepDollars: 400,
                commission: dollars(2.5),
                maxEvalDays: 4,
                winrate: fraction(0.45),
            }),
        golden: {
            initialValue: 0.57977334038907,
            passProbability: 0.57977334038907,
            reachedStateCount: 16_958,
            risks: [800, 400, 0, 0],
        },
        name: 'the same plan with a $2.50 commission',
    },
    {
        build: () => stepConfig(consistencyPlan()),
        golden: {
            initialValue: 0.43016729264128006,
            passProbability: 0.43016729264128006,
            reachedStateCount: 20_094,
            risks: [400, 600, 600, 0],
        },
        name: 'a best-day consistency rule that doubles the target',
    },
    {
        build: () => stepConfig(lockingPlan()),
        golden: {
            initialValue: 0.526941599039488,
            passProbability: 0.526941599039488,
            reachedStateCount: 1299,
            risks: [800, 400, 0, 0],
        },
        name: 'a drawdown that locks',
    },
    {
        build: () =>
            stepConfig(
                stepPlan({
                    evalDailyLossLimit: {
                        amount: dollars(1000),
                        kind: DailyLossLimitKind.Flat,
                    },
                }),
            ),
        golden: {
            initialValue: 0.5027345532190721,
            passProbability: 0.5027345532190721,
            reachedStateCount: 1590,
            risks: [800, 800, 200, 0],
        },
        name: 'a $1,000 daily loss limit, which keeps the recursive solve',
    },
    {
        build: () =>
            stepConfig(stepPlan(), {
                stopRule: { kind: DayStopRuleKind.DayGreen },
            }),
        golden: {
            initialValue: 0.4434592619560961,
            passProbability: 0.4434592619560961,
            reachedStateCount: 1353,
            risks: [800, 800, 800, 0],
        },
        name: 'a stop-when-green rule, which keeps the recursive solve',
    },
];

function affordableRiskCallsOf(config: EvalStateValueConfig): {
    readonly calls: number;
    readonly reachedStateCount: number;
} {
    const spy = vi.spyOn(config.plan, 'affordableRisk');
    try {
        const { reachedStateCount } = computeEvalStateValue(config);
        return { calls: spy.mock.calls.length, reachedStateCount };
    } finally {
        spy.mockRestore();
    }
}

function solved(config: EvalStateValueConfig): EvalGolden {
    const { passProbability } = {
        passProbability: computeEvalStateValue(config).policyPassProbability(),
    };
    return { ...solvedWithoutPassProbability(config), passProbability };
}

function solvedWithoutPassProbability(
    config: EvalStateValueConfig,
): Omit<EvalGolden, 'passProbability'> {
    const result = computeEvalStateValue(config);
    return {
        initialValue: result.initialValue,
        reachedStateCount: result.reachedStateCount,
        risks: [0, 1, 2, 3].map(
            (tradeIndex) =>
                result.dayPolicy.computeRisk?.(
                    config.plan.initialState(),
                    tradeIndex,
                ) ?? NaN,
        ),
    };
}

function topStepNoFeeStandardConfig(): EvalStateValueConfig {
    const plan = new TopStep().findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.NoFeeStandard,
    });
    if (!plan) throw new Error('TopStep no-fee-standard 50K plan not found');
    return {
        actionStepDollars: TOP_STEP_ACTION_STEP_DOLLARS,
        dayCost: (day) => 20 + day,
        maxEvalDays: TOP_STEP_EVAL_DAYS,
        plan,
        profitStepDollars: TOP_STEP_PROFIT_STEP_DOLLARS,
        rrRatio: 2,
        terminalValueAtFail: (failedAttemptDays) => 100 - failedAttemptDays,
        terminalValueAtPass: 5000,
        tradesPerDay: 4,
        winrate: fraction(0.4),
    };
}

describe('the eval DP solves each within-day tree once per start cushion (WP66a R3)', () => {
    it.each(SCENARIOS)(
        'gives $name exactly its pre-topology value, state count, policy pass probability and day-one risks',
        ({ build, golden }) => {
            expect(solved(build())).toStrictEqual(golden);
        },
    );

    it('gives TopStep No-fee Standard 50K on a $250 action grid, with the day cost and failure terminals of a rate-search solve, the pre-topology value, state count and day-one risks', () => {
        expect(
            solvedWithoutPassProbability(topStepNoFeeStandardConfig()),
        ).toStrictEqual({
            initialValue: 2289.685714715247,
            reachedStateCount: 2463,
            risks: [500, 750, 750, 750],
        });
    });

    it('asks the plan for an affordable risk far less often than before on a three-trade day, because day starts that share a cushion share one tree', () => {
        const { calls } = affordableRiskCallsOf(stepConfig(stepPlan()));

        expect(calls).toBeLessThan(
            PRE_TOPOLOGY_BASE_AFFORDABLE_RISK_CALLS /
                BASE_AFFORDABLE_RISK_REDUCTION,
        );
    });

    it('builds no more trees than a fraction of the day starts it solves on a one-trade toy over a long horizon', () => {
        const { calls, reachedStateCount } = affordableRiskCallsOf(
            toyDpConfig(
                toyPlan(250),
                SHARING_TOY_DAYS,
                SHARING_TOY_MAX_ACTION_DOLLARS,
            ),
        );

        expect(reachedStateCount).toBeGreaterThan(0);
        expect(calls).toBeLessThanOrEqual(
            reachedStateCount / SHARING_TOY_STATE_SHARE,
        );
    });
});
