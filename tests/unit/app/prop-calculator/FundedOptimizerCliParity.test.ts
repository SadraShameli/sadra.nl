import { parseArgs } from 'citty';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { buildSimInputs as pureBuildSimInputs } from '~/app/(app)/prop-calculator/_components/calculatorSimInputs';
import {
    type FundedOptimizerCalculatorInputs,
    fundedOptimizerRanking,
    fundedOptimizerRequest,
    fundedOptimizerRows,
    fundedOptimizerSweep,
    fundedSweepPlan,
    fundedSweepSimInputs,
} from '~/app/(app)/prop-calculator/_components/fundedOptimizer/fundedOptimizerModel';
import { SizingMode } from '~/app/(app)/prop-calculator/_components/types';
import { buildSimInputs as hookBuildSimInputs } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { type FundedSweepResult } from '~/app/(app)/prop-calculator/_workers/fundedSweepWorkerMessages';
import {
    readFundedCandidates,
    resolveFundedSort,
} from '~/cli/commands/prop/optimize/funded/command';
import {
    liveTransferHazardArgument,
    ObjectiveNotApplicable,
    payoutRequestPolicyArgument,
    tradingArguments,
    TradingInputs,
} from '~/cli/commands/prop/shared';
import {
    DayStopRuleKind,
    findFirm,
    FirmId,
    InstrumentSymbol,
    PayoutRequestPolicy,
    type Plan,
    PolicySizing,
    resolvePositionSizing,
    RungSizing,
    serializePlanId,
    type SimInputs,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';
import { TopStepVariant } from '~/lib/prop-calculator/core';
import {
    DEFAULT_FUNDED_FLAT_CANDIDATES,
    FundedCandidateBuildKind,
    FundedSortKey,
    fundedSortOfObjective,
    runFundedCandidateSweep,
} from '~/lib/prop-calculator/optimize';

const SCANNED_FOLDERS = [
    path.join('app', '(app)', 'prop-calculator'),
    'cli',
    path.join('lib', 'prop-calculator'),
];

const TRIALS = 120;
const FUNDED_DAYS = 20;
const EVAL_DAYS = 20;

const CLI_ARGS = {
    ...tradingArguments,
    ...payoutRequestPolicyArgument,
    ...liveTransferHazardArgument,
};

const CLI_ARGV = [
    '--trials',
    String(TRIALS),
    '--seed',
    '7',
    '--risk',
    '400',
    '--rr',
    '2',
    '--winrate',
    '0.45',
    '--tpd',
    '3',
    '--eval-days',
    String(EVAL_DAYS),
    '--funded-days',
    String(FUNDED_DAYS),
    '--eval-discount',
    '20',
    '--activation-discount',
    '10',
    '--monthly-discount',
    '5',
    '--unaffordable',
    RungSizing.SkipIfUnaffordable,
    '--live-transfer-hazard',
    '0.25',
    '--ladder',
    '300,500',
    '--stop',
    'day-green',
    '--instrument',
    'NQ',
    '--stop-points',
    '10',
    '--request-size',
    '500',
    '--retain-cushion',
    '2000',
    '--payout-policy',
    PayoutRequestPolicy.FullRequestOnly,
];

function requirePlan(value: null | Plan | undefined, message: string): Plan {
    if (value === null || value === undefined) throw new Error(message);
    return value;
}

const TOPSTEP_50K = requirePlan(
    findFirm(FirmId.TopStep)?.findPlanBySerial(
        serializePlanId({
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.StandardStandard,
        }),
    ),
    'expected the TopStep 50K Standard/Standard plan to resolve',
);

function builtSweep(result: FundedSweepResult) {
    if (result.kind !== FundedCandidateBuildKind.Built) {
        throw new Error('expected a built sweep');
    }
    return result;
}

function calculatorInputs(
    patch: Partial<FundedOptimizerCalculatorInputs> = {},
): FundedOptimizerCalculatorInputs {
    return {
        ...defaultCalculatorState(),
        activationDiscountPercent: 10,
        dayStop: { kind: DayStopRuleKind.DayGreen },
        evalDayPolicy: {
            ladder: [300, 500],
            maxLossesPerDay: null,
            sizing: PolicySizing.ContractCapped,
            stopRule: { kind: DayStopRuleKind.DayGreen },
        },
        evalDiscountPercent: 20,
        fundedHorizonDays: FUNDED_DAYS,
        instrument: InstrumentSymbol.NQ,
        liveTransferHazard: 0.25,
        maxEvalDays: EVAL_DAYS,
        monthlySubscriptionDiscountPercent: 5,
        payoutRequestSize: 500,
        plan: TOPSTEP_50K,
        retainedCushion: 2000,
        riskDollars: 400,
        rrRatio: 2,
        rungSizing: RungSizing.SkipIfUnaffordable,
        seed: 7,
        sizingMode: SizingMode.Dollar,
        stopPoints: 10,
        tradesPerDay: 3,
        trials: TRIALS,
        winrate: 0.45,
        ...patch,
    };
}

function cliCells(): string[][] {
    const base = cliSimInputs();
    const positionSizing = resolvePositionSizing(
        base.instrument,
        base.stopPoints,
    );
    const candidates = readFundedCandidates(
        { flat: DEFAULT_FUNDED_FLAT_CANDIDATES.join(',') },
        { kind: DayStopRuleKind.DayGreen },
        positionSizing,
        TOPSTEP_50K,
    );
    return fundedOptimizerRows(
        runFundedCandidateSweep(base, candidates, FundedSortKey.Monthly),
        FundedSortKey.Monthly,
        TRIALS,
    ).map((row) => [...row.cells]);
}

function cliSimInputs(): SimInputs {
    const inputs = TradingInputs.parse(parseArgs(CLI_ARGV, CLI_ARGS) as never);
    return {
        ...inputs.toSimInputs(TOPSTEP_50K),
        payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
    };
}

function webCells(inputs: FundedOptimizerCalculatorInputs): string[][] {
    const request = fundedOptimizerRequest(inputs, DEFAULT_RULEBOOK);
    const plan = requirePlan(fundedSweepPlan(request), 'plan did not resolve');
    const { rows } = builtSweep(fundedOptimizerSweep(plan, request));
    return fundedOptimizerRows(rows, FundedSortKey.Monthly, TRIALS).map(
        (row) => [...row.cells],
    );
}

describe('the funded optimizer page runs the inputs the CLI runs (F-27 (1), (2), (4), (9))', () => {
    it('hands the engine the same SimInputs as TradingInputs.toSimInputs for the same plan, seed, trials, risk, discounts, rung sizing, eval ladder and hazard', () => {
        const request = fundedOptimizerRequest(
            calculatorInputs(),
            DEFAULT_RULEBOOK,
        );
        const plan = requirePlan(
            fundedSweepPlan(request),
            'plan did not resolve',
        );
        const { plan: webPlan, ...web } = fundedSweepSimInputs(plan, request);
        const { plan: cliPlan, ...cli } = cliSimInputs();
        expect(webPlan.id).toStrictEqual(cliPlan.id);
        expect(web).toEqual({
            ...cli,
            discounts: { resetPercent: 0, ...cli.discounts },
        });
    });

    it('ranks the same rows with the same cells as runFundedCandidateSweep on the CLI inputs', () => {
        const web = webCells(calculatorInputs());
        expect(web.length).toBeGreaterThan(1);
        expect(web).toStrictEqual(cliCells());
    });

    it('moves the page rows with the coupon discounts, as it moves the CLI rows', () => {
        expect(
            webCells(
                calculatorInputs({
                    activationDiscountPercent: 0,
                    evalDiscountPercent: 0,
                    monthlySubscriptionDiscountPercent: 0,
                }),
            ),
        ).not.toStrictEqual(webCells(calculatorInputs()));
    });

    it('moves the page rows with the applied eval ladder', () => {
        expect(
            webCells(calculatorInputs({ evalDayPolicy: null })),
        ).not.toStrictEqual(webCells(calculatorInputs()));
    });

    it('moves the page rows with the live-transfer hazard', () => {
        expect(
            webCells(calculatorInputs({ liveTransferHazard: 0 })),
        ).not.toStrictEqual(webCells(calculatorInputs()));
    });

    it('builds its base through the one buildSimInputs mapping, which the hook module re-exports', () => {
        expect(hookBuildSimInputs).toBe(pureBuildSimInputs);
        const inputs = calculatorInputs();
        const request = fundedOptimizerRequest(inputs, DEFAULT_RULEBOOK);
        const { discounts, rungSizing } = pureBuildSimInputs(inputs);
        expect(request.base.discounts).toStrictEqual(discounts);
        expect(request.base.rungSizing).toBe(rungSizing);
    });

    it('keeps the request structured-cloneable with the eval ladder as plain parts', () => {
        const request = fundedOptimizerRequest(
            calculatorInputs(),
            DEFAULT_RULEBOOK,
        );
        expect(structuredClone(request)).toStrictEqual(request);
        expect(request.evalLadder).toStrictEqual({
            ladder: [300, 500],
            maxLossesPerDay: null,
            sizing: PolicySizing.ContractCapped,
            stopRule: { kind: DayStopRuleKind.DayGreen },
        });
    });
});

describe('the CLI and the page give the same sort for every objective (PT-83 re-review, DRY)', () => {
    it.each([
        ['monthly', SizingObjective.MonthlyNet],
        ['cycle', SizingObjective.CycleCash],
    ] as const)(
        'maps --objective %s to the sort the page gives %s',
        (flag, objective) => {
            const cliSort = resolveFundedSort(
                { objective: flag, sort: FundedSortKey.Monthly },
                false,
            );
            expect(cliSort).toBe(fundedOptimizerRanking(objective).sort);
            expect(cliSort).toBe(fundedSortOfObjective(objective));
        },
    );

    it('refuses ruin-first in the CLI and keeps the monthly sort on the page', () => {
        expect(() =>
            resolveFundedSort(
                { objective: 'ruin-first', sort: FundedSortKey.Monthly },
                false,
            ),
        ).toThrow(ObjectiveNotApplicable);
        expect(fundedOptimizerRanking(SizingObjective.RuinFirst).sort).toBe(
            FundedSortKey.Monthly,
        );
    });

    it('writes the objective to sort mapping once in src', async () => {
        const root = path.join(process.cwd(), 'src');
        const mapping =
            /case SizingObjective\.CycleCash:\s*\{\s*return FundedSortKey\.Cycle;/u;
        const folders = await Promise.all(
            SCANNED_FOLDERS.map((folder) =>
                readdir(path.join(root, folder), {
                    recursive: true,
                    withFileTypes: true,
                }),
            ),
        );
        const files = folders
            .flat()
            .filter((entry) => entry.isFile() && /\.tsx?$/u.test(entry.name))
            .map((entry) => path.join(entry.parentPath, entry.name));
        const owners = await Promise.all(
            files.map(async (file) =>
                mapping.test(await readFile(file, 'utf8'))
                    ? path.relative(root, file)
                    : null,
            ),
        );
        expect(owners.filter((owner) => owner !== null)).toStrictEqual([
            path.join(
                'lib',
                'prop-calculator',
                'optimize',
                'FundedCandidateSweep.ts',
            ),
        ]);
    });
});
