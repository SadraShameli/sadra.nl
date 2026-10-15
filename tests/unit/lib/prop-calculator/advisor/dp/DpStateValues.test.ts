import { beforeAll, describe, expect, it } from 'vitest';

import {
    DEFAULT_RULEBOOK,
    DpSampleStage,
    DpSamplesUnavailableReason,
} from '~/lib/prop-calculator/advisor';
import {
    buildDpSolverCall,
    type DpStateValueReport,
    type DpStateValues,
    DpStateValuesKind,
    dpStateValuesOf,
} from '~/lib/prop-calculator/advisor/dp';
import {
    type DocumentedPolicySpec,
    LifetimePayoutCapBasis,
    RebuyLagBasis,
} from '~/lib/prop-calculator/advisor/policy';
import {
    evalStartAccount,
    freshFundedAccount,
    VALUE_CHAIN_STEP_ORDER,
    ValueChainStepKind,
} from '~/lib/prop-calculator/advisor/value';
import { CENTS_PER_DOLLAR } from '~/lib/prop-calculator/core';
import {
    type AverageRewardSolution,
    solveAverageRewardPolicy,
} from '~/lib/prop-calculator/core/AverageRewardSolver';

import { toyDpConfig, toyDpPlan } from './dpFixtures';

const RUNG_DOLLARS = 50;

const plan = toyDpPlan();
const config = toyDpConfig(plan, { maxEvalDays: 3, tradesPerDay: 2 });

const CHAIN_SPEC: DocumentedPolicySpec = {
    enginePolicy: {
        commissionPerRoundTrip: 0,
        fundedHorizonDays: 252,
        lifetimePayoutCapBasis: LifetimePayoutCapBasis.LiveTriggersNotChecked,
        lifetimePayoutCapOverride: null,
        payoutRequestOverride: null,
        rebuyLagBasis: RebuyLagBasis.AssumedZero,
        rebuyLagDays: 0,
        retainedCushionRequest: 0,
    },
    rulebook: DEFAULT_RULEBOOK,
    run: { maxEvalDays: 3, seed: 1, trials: 10 },
};

function cents(dollarAmount: number): number {
    return Math.round(dollarAmount * CENTS_PER_DOLLAR);
}

function fundedValues(
    solution: AverageRewardSolution,
    hasRateZero = true,
): DpStateValues {
    return dpStateValuesOf({
        account: freshFundedAccount(plan),
        chainSpec: CHAIN_SPEC,
        documentedRungDollars: RUNG_DOLLARS,
        solution: hasRateZero ? solution : { ...solution, rateZero: null },
    });
}

function reportOf(values: DpStateValues): DpStateValueReport {
    if (values.state.kind !== DpStateValuesKind.Read) {
        throw new Error(`no report: ${values.state.reason}`);
    }
    return values.state.report;
}

describe('dpStateValuesOf (PT-30a DpStateValues, F-V17)', () => {
    let solution: AverageRewardSolution;

    beforeAll(() => {
        solution = solveAverageRewardPolicy(buildDpSolverCall(config, plan));
    });

    it('reads the funded value at the rebuilt state from the solved DP, in integer cents', () => {
        const account = freshFundedAccount(plan);
        const cycle = account.fundedTracker?.cycleSnapshot(plan, account.state);
        const reading = solution.fundedResult.valuesAt(
            account.state,
            0,
            cycle,
            [RUNG_DOLLARS],
        );
        const report = reportOf(fundedValues(solution));

        expect(report.value.rateAdjustedCents).toBe(
            cents(reading?.value ?? NaN),
        );
        expect(report.noTrade.rateAdjustedCents).toBe(
            cents(reading?.noTradeValue ?? NaN),
        );
        expect(report.bestRiskCents).toBe(
            cents(
                solution.fundedResult.dayPolicy.computeRisk?.(
                    account.state,
                    0,
                    cycle,
                ) ?? NaN,
            ),
        );
        expect(report.candidates.length).toBe(reading?.trades.length);
        expect(Number.isSafeInteger(report.value.rateAdjustedCents)).toBe(true);
    });

    it('values the documented rung after a win and after a loss', () => {
        const report = reportOf(fundedValues(solution));

        expect(report.documentedRung?.intendedRiskCents).toBe(
            RUNG_DOLLARS * CENTS_PER_DOLLAR,
        );
        expect(
            report.documentedRung?.afterWin.rateAdjustedCents,
        ).toBeGreaterThan(
            report.documentedRung?.afterLoss.rateAdjustedCents ?? Infinity,
        );
    });

    it('reports the rate-0 cash beside the rate-adjusted value when the search solved rate 0', () => {
        const account = freshFundedAccount(plan);
        const cycle = account.fundedTracker?.cycleSnapshot(plan, account.state);
        const rateZero = solution.rateZero?.fundedResult.valuesAt(
            account.state,
            0,
            cycle,
        );

        expect(solution.rateZero).not.toBeNull();
        expect(reportOf(fundedValues(solution)).value.rateZeroCashCents).toBe(
            cents(rateZero?.value ?? NaN),
        );
        expect(
            reportOf(fundedValues(solution, false)).value.rateZeroCashCents,
        ).toBeNull();
    });

    it('lists the four value-chain states in order, the eval start at the eval DP initial value and the fresh funded state at the fresh account value', () => {
        const values = fundedValues(solution);
        const byKind = new Map(
            values.chain.map((entry) => [entry.kind, entry]),
        );
        const evalStart = byKind.get(ValueChainStepKind.EvalStart);
        const freshFunded = byKind.get(ValueChainStepKind.FreshFunded);

        expect(values.chain.map((entry) => entry.kind)).toEqual(
            VALUE_CHAIN_STEP_ORDER,
        );
        expect(evalStart !== undefined && 'value' in evalStart).toBe(true);
        expect(
            evalStart !== undefined && 'value' in evalStart
                ? evalStart.value.rateAdjustedCents
                : null,
        ).toBe(cents(solution.evalResult.initialValue));
        expect(
            freshFunded !== undefined && 'value' in freshFunded
                ? freshFunded.value
                : null,
        ).toEqual(reportOf(values).value);
    });

    it('reads an eval account on its DP day and refuses one without a valid eval day index', () => {
        const account = evalStartAccount(plan);
        const onDay = dpStateValuesOf({
            account: {
                ...account,
                state: { ...account.state, elapsedDays: 0 },
            },
            chainSpec: CHAIN_SPEC,
            documentedRungDollars: RUNG_DOLLARS,
            solution,
        });
        const withoutDay = dpStateValuesOf({
            account: {
                ...account,
                state: { ...account.state, elapsedDays: -1 },
            },
            chainSpec: CHAIN_SPEC,
            documentedRungDollars: RUNG_DOLLARS,
            solution,
        });

        expect(onDay.stage).toBe(DpSampleStage.Eval);
        expect(reportOf(onDay).value.rateAdjustedCents).toBe(
            cents(solution.evalResult.initialValue),
        );
        expect(withoutDay.state).toEqual({
            kind: DpStateValuesKind.Unavailable,
            reason: DpSamplesUnavailableReason.EvalElapsedDaysMissing,
        });
    });

    it('matches each candidate to the rate-0 solve by risk, so the rate-0 cash sits beside the rate-adjusted value', () => {
        const account = freshFundedAccount(plan);
        const cycle = account.fundedTracker?.cycleSnapshot(plan, account.state);
        const rateZero = solution.rateZero?.fundedResult.valuesAt(
            account.state,
            0,
            cycle,
        );
        const report = reportOf(fundedValues(solution));

        for (const candidate of report.candidates) {
            const cash = rateZero?.trades.find(
                (trade) => cents(trade.risk) === candidate.riskCents,
            );
            expect(candidate.expected.rateZeroCashCents).toBe(
                cents(cash?.value ?? NaN),
            );
        }
    });

    it('carries the solved rate in cents', () => {
        expect(fundedValues(solution).ratePerDayCents).toBe(
            cents(solution.ratePerDay),
        );
    });
});
