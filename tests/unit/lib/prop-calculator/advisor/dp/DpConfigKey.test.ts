import { createHash } from 'node:crypto';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { dpObjectiveSolverConfig } from '~/cli/commands/prop/optimize/dp/command';
import { SizingObjective } from '~/lib/prop-calculator/advisor';
import {
    AVERAGE_REWARD_FIELD_KEYING,
    buildDpSolverCall,
    DP_CONFIG_KEY_LENGTH,
    type DpEvalGrid,
    type DpFundedGrid,
    type DpSolveConfig,
    dpConfigKey,
    EVAL_GRID_FIELD_KEYING,
    FieldKeying,
    FUNDED_GRID_FIELD_KEYING,
    RENEWAL_OBJECTIVE_FIELD_KEYING,
} from '~/lib/prop-calculator/advisor/dp';
import {
    dollars,
    InstrumentSymbol,
    NO_PLAN_OPT_INS,
    PayoutRequestPolicy,
    percent,
    RungSizing,
} from '~/lib/prop-calculator/core';
import {
    type AverageRewardConfig,
    type EvalGridConfig,
    type FundedGridConfig,
} from '~/lib/prop-calculator/core/AverageRewardSolver';
import { type RenewalCycleObjectiveInit } from '~/lib/prop-calculator/core/RenewalCycleObjective';
import { stableJson } from '~/lib/stableJson';

import { toyDpConfig, toyDpPlan } from './dpFixtures';

const FUNDED_ALTERNATES: Readonly<Record<keyof DpFundedGrid, unknown>> = {
    actionStepMultiple: 0.5,
    convergenceTolerance: 0.5,
    cushionStepMultiple: 0.5,
    cycleBestDayBucketCount: 9,
    maxActionMultiple: 2,
    maxCushionMultiple: 5,
    maxIterationsPerLevel: 77,
    maxPreLockOffsetMultiple: 4,
    maxTailCushionMultiple: 9,
    minRetainedCushion: 2500,
    payoutRegimeCap: 3,
    payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
    payoutRequestSize: dollars(750),
    rungSizing: RungSizing.SkipIfUnaffordable,
    tailCushionStepMultiple: 0.7,
};

const EVAL_ALTERNATES: Readonly<Record<keyof DpEvalGrid, unknown>> = {
    actionStepDollars: 25,
    cushionStepDollars: 25,
    maxActionDollars: 75,
    profitStepDollars: 25,
    rungSizing: RungSizing.SkipIfUnaffordable,
};

const TOP_LEVEL_ALTERNATES: Readonly<
    Record<keyof DpSolveConfig, unknown>
> = {
    commission: 2.5,
    copyAccounts: 3,
    discounts: {
        activationPercent: percent(10),
        evalPercent: percent(20),
    },
    evalGrid: { actionStepDollars: 10 },
    fundedGrid: { actionStepMultiple: 0.25 },
    fundedHorizonDays: 120,
    lifetimePayoutCapOverride: 6,
    maxEvalDays: 15,
    maxSolves: 12,
    objective: SizingObjective.CycleCash,
    optIns: { ...NO_PLAN_OPT_INS, takesFundedReset: true },
    planRulesFingerprint: 'e'.repeat(64),
    planSerial: 'another:plan:serial',
    positionSizing: { instrument: InstrumentSymbol.MES, stopPoints: 12 },
    rateTolerancePerDay: 0.01,
    rebuyLagDays: 4,
    rrRatio: 3,
    startRatePerDay: 5,
    tradesPerDay: 5,
    winrate: 0.45,
};

function keyedFields(
    table: Readonly<Record<string, FieldKeying>>,
): string[] {
    return Object.entries(table)
        .filter(([, keying]) => keying === FieldKeying.Keyed)
        .map(([field]) => field)
        .toSorted();
}

describe('dpConfigKey', () => {
    const plan = toyDpPlan();
    const base = toyDpConfig(plan);

    it('is sha256 hex over the stable JSON of the config', () => {
        const expected = createHash('sha256')
            .update(stableJson(base))
            .digest('hex');

        expect(dpConfigKey(base)).toBe(expected);
        expect(dpConfigKey(base)).toHaveLength(DP_CONFIG_KEY_LENGTH);
        expect(DP_CONFIG_KEY_LENGTH).toBe(64);
        expect(dpConfigKey(base)).toMatch(/^[\da-f]{64}$/);
    });

    it('is independent of property insertion order and of explicit undefined fields', () => {
        const reordered = Object.fromEntries(
            Object.entries(base).toReversed(),
        ) as unknown as DpSolveConfig;
        const withUndefined: DpSolveConfig = {
            ...base,
            fundedGrid: { ...base.fundedGrid, payoutRegimeCap: undefined },
        };

        expect(dpConfigKey(reordered)).toBe(dpConfigKey(base));
        expect(dpConfigKey(withUndefined)).toBe(dpConfigKey(base));
    });

    it.each(Object.entries(TOP_LEVEL_ALTERNATES))(
        'changes when the top-level field %s changes',
        (field, alternate) => {
            const changed = { ...base, [field]: alternate } as DpSolveConfig;

            expect(dpConfigKey(changed)).not.toBe(dpConfigKey(base));
        },
    );

    it.each(Object.entries(FUNDED_ALTERNATES))(
        'changes when the funded grid field %s changes',
        (field, alternate) => {
            const changed: DpSolveConfig = {
                ...base,
                fundedGrid: { ...base.fundedGrid, [field]: alternate },
            };

            expect(dpConfigKey(changed)).not.toBe(dpConfigKey(base));
        },
    );

    it.each(Object.entries(EVAL_ALTERNATES))(
        'changes when the eval grid field %s changes',
        (field, alternate) => {
            const changed: DpSolveConfig = {
                ...base,
                evalGrid: { ...base.evalGrid, [field]: alternate },
            };

            expect(dpConfigKey(changed)).not.toBe(dpConfigKey(base));
        },
    );

    it('keys every field the grids and the solver honour: the alternates cover exactly the keyed fields', () => {
        expect(Object.keys(FUNDED_ALTERNATES).toSorted()).toEqual(
            keyedFields(FUNDED_GRID_FIELD_KEYING),
        );
        expect(Object.keys(EVAL_ALTERNATES).toSorted()).toEqual(
            keyedFields(EVAL_GRID_FIELD_KEYING),
        );
    });

    it('classifies every key of the solver grids, the solver config and the renewal objective (type level)', () => {
        expectTypeOf<keyof typeof FUNDED_GRID_FIELD_KEYING>().toEqualTypeOf<
            keyof FundedGridConfig
        >();
        expectTypeOf<keyof typeof EVAL_GRID_FIELD_KEYING>().toEqualTypeOf<
            keyof EvalGridConfig
        >();
        expectTypeOf<keyof typeof AVERAGE_REWARD_FIELD_KEYING>().toEqualTypeOf<
            keyof AverageRewardConfig
        >();
        expectTypeOf<
            keyof typeof RENEWAL_OBJECTIVE_FIELD_KEYING
        >().toEqualTypeOf<keyof RenewalCycleObjectiveInit>();
        expectTypeOf<keyof DpFundedGrid>().toEqualTypeOf<
            keyof typeof FUNDED_ALTERNATES
        >();
        expect(true).toBe(true);
    });

    it('keeps the funded stop rule out of the key and out of the solve: the funded DP cannot model one', () => {
        expect(FUNDED_GRID_FIELD_KEYING.stopRule).toBe(
            FieldKeying.StopRuleNotModeled,
        );
        expect(EVAL_GRID_FIELD_KEYING.stopRule).toBe(
            FieldKeying.StopRuleNotModeled,
        );
        const call = buildDpSolverCall(base, plan);

        expect(call.fundedGrid?.stopRule).toBeUndefined();
        expect(call.evalGrid?.stopRule).toBeUndefined();
    });

    it('treats the worker count as not result-affecting', () => {
        expect(AVERAGE_REWARD_FIELD_KEYING.maxWorkers).toBe(
            FieldKeying.NotResultAffecting,
        );
        expect(AVERAGE_REWARD_FIELD_KEYING.fundedWorkers).toBe(
            FieldKeying.NotResultAffecting,
        );
    });
});

describe('buildDpSolverCall', () => {
    const plan = toyDpPlan();

    it('builds the solver call from the one typed config: grids, shared fields and the renewal objective', () => {
        const config = toyDpConfig(plan, {
            commission: 2.5,
            copyAccounts: 2,
            evalGrid: { actionStepDollars: 25 },
            fundedGrid: {
                actionStepMultiple: 0.5,
                minRetainedCushion: 2000,
                payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
                payoutRequestSize: dollars(500),
            },
            fundedHorizonDays: 120,
            maxEvalDays: 15,
            maxSolves: 12,
            rateTolerancePerDay: 0.01,
            rebuyLagDays: 4,
            rrRatio: 3,
            startRatePerDay: 5,
            tradesPerDay: 3,
            winrate: 0.45,
        });

        const call = buildDpSolverCall(config, plan);

        expect(call.fundedGrid).toEqual({
            actionStepMultiple: 0.5,
            commission: 2.5,
            minRetainedCushion: 2000,
            payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
            payoutRequestSize: 500,
            positionSizing: null,
            tradesPerDay: 3,
        });
        expect(call.evalGrid).toEqual({
            actionStepDollars: 25,
            commission: 2.5,
            positionSizing: null,
            tradesPerDay: 3,
        });
        expect(call).toMatchObject({
            maxSolves: 12,
            rateTolerancePerDay: 0.01,
            rrRatio: 3,
            startRatePerDay: 5,
            winrate: 0.45,
        });
        expect(call.objective).toMatchObject({
            copyAccounts: 2,
            fundedHorizonDays: 120,
            maxEvalDays: 15,
            rebuyLagDays: 4,
        });
        expect(call.objective.plan).toBe(plan);
    });

    it('omits the optional solver fields that the config leaves null', () => {
        const call = buildDpSolverCall(toyDpConfig(plan), plan);

        expect(call.rateTolerancePerDay).toBeUndefined();
        expect(call.startRatePerDay).toBeUndefined();
        expect(call.objective.discounts).toBeUndefined();
    });

    it('resolves one position sizing for both grids from the instrument and stop', () => {
        const call = buildDpSolverCall(
            toyDpConfig(plan, {
                positionSizing: {
                    instrument: InstrumentSymbol.MES,
                    stopPoints: 20,
                },
            }),
            plan,
        );

        expect(call.fundedGrid?.positionSizing).toBe(
            call.evalGrid?.positionSizing,
        );
        expect(call.fundedGrid?.positionSizing).toMatchObject({
            instrument: { symbol: InstrumentSymbol.MES },
            stopPoints: 20,
        });
    });

    it('applies a lifetime cap override through withMaxLifetimePayouts and leaves the plan alone without one', () => {
        const withOverride = buildDpSolverCall(
            toyDpConfig(plan, { lifetimePayoutCapOverride: 4 }),
            plan,
        );
        const without = buildDpSolverCall(toyDpConfig(plan), plan);

        expect(withOverride.objective.plan.maxLifetimePayouts).toBe(4);
        expect(plan.maxLifetimePayouts).toBe(1);
        expect(without.objective.plan).toBe(plan);
    });

    it('carries the runtime worker cap without it being part of the config', () => {
        const call = buildDpSolverCall(toyDpConfig(plan), plan, {
            maxWorkers: 3,
        });

        expect(call.maxWorkers).toBe(3);
        expect(buildDpSolverCall(toyDpConfig(plan), plan).maxWorkers).toBe(
            undefined,
        );
    });

    it.each([
        SizingObjective.CycleCash,
        SizingObjective.MonthlyNet,
        SizingObjective.RuinFirst,
    ])(
        'matches the optimize dp objective handling for %s',
        (objective) => {
            const config = toyDpConfig(plan, {
                maxSolves: 12,
                startRatePerDay: 5,
                objective,
            });

            const call = buildDpSolverCall(config, plan);
            const cli = dpObjectiveSolverConfig(call, objective);

            expect(call.maxSolves).toBe(cli.maxSolves);
            expect(call.startRatePerDay).toBe(cli.startRatePerDay);
        },
    );
});
