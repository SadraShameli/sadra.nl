import { describe, expect, it } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    type FundedOptimizerCalculatorInputs,
    fundedOptimizerLiveTransferLines,
    fundedOptimizerPolicyBasis,
    fundedOptimizerRanking,
    fundedOptimizerRequest,
    fundedOptimizerRows,
    fundedOptimizerSweep,
    fundedOptimizerTrialsNote,
    FundedPolicyBasis,
    fundedSweepPlan,
    PERCENT_CANDIDATES_NEED_STOP_NOTE,
} from '~/app/(app)/prop-calculator/_components/fundedOptimizer/fundedOptimizerModel';
import { MAX_FUNDED_SWEEP_TRIALS } from '~/app/(app)/prop-calculator/_workers/fundedSweepWorkerMessages';
import { formatCurrency, formatPercent } from '~/lib/format';
import {
    CENTS_PER_DOLLAR,
    findFirm,
    FirmId,
    fraction,
    InstrumentSymbol,
    LiveTransferContinuationKind,
    resolvePositionSizing,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';
import {
    applyEnginePolicy,
    DEFAULT_RULEBOOK,
    type RulebookParameters,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';
import { type Plan, TopStepVariant } from '~/lib/prop-calculator/core';
import {
    buildFundedCandidates,
    DEFAULT_FUNDED_FLAT_CANDIDATES,
    FundedCandidateBuildKind,
    fundedRowStandardErrors,
    FundedSortKey,
    type FundedSweepRow,
    runFundedCandidateSweep,
} from '~/lib/prop-calculator/optimize';
import {
    LIVE_TRANSFER_CONTINUATION_TEXT,
    simulate,
} from '~/lib/prop-calculator/simulator';

function requireDefined<T>(value: T | undefined, message: string): T {
    if (value === undefined) throw new Error(message);
    return value;
}

function requirePlan(value: null | Plan, message: string): Plan {
    if (value === null) throw new Error(message);
    return value;
}

const TOPSTEP: TradingFirm = requireDefined(
    findFirm(FirmId.TopStep),
    'expected the TopStep firm to be registered',
);
const TOPSTEP_50K = requirePlan(
    TOPSTEP.findPlanBySerial(
        serializePlanId({
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.StandardStandard,
        }),
    ),
    'expected the TopStep 50K Standard/Standard plan to resolve',
);

const SWEEP_STRUCTURE_TRIALS = 200;

function baseInputs(): FundedOptimizerCalculatorInputs {
    const state = defaultCalculatorState();
    return { ...state, plan: TOPSTEP_50K, trials: SWEEP_STRUCTURE_TRIALS };
}

describe('fundedOptimizerRequest (Q30)', () => {
    it('carries the rulebook retained cushion, never $0, when the calculator cushion is null', () => {
        const request = fundedOptimizerRequest(baseInputs(), DEFAULT_RULEBOOK);
        expect(request.policy.retainedCushionRequest).toBe(
            DEFAULT_RULEBOOK.payout.retainedCushionCents / CENTS_PER_DOLLAR,
        );
        expect(request.policy.retainedCushionRequest).toBeGreaterThan(0);
    });

    it('prefers the calculator cushion over the rulebook default when set', () => {
        const request = fundedOptimizerRequest(
            { ...baseInputs(), retainedCushion: 3500 },
            DEFAULT_RULEBOOK,
        );
        expect(request.policy.retainedCushionRequest).toBe(3500);
    });

    it('falls back to the rulebook payout request size when the calculator has none', () => {
        const request = fundedOptimizerRequest(baseInputs(), DEFAULT_RULEBOOK);
        expect(request.base.payoutRequestSize).toBe(
            DEFAULT_RULEBOOK.payout.requestCents / CENTS_PER_DOLLAR,
        );
    });

    it('carries the plan serial and opt-ins so the worker can rebuild the plan', () => {
        const request = fundedOptimizerRequest(baseInputs(), DEFAULT_RULEBOOK);
        expect(request.firmId).toBe(FirmId.TopStep);
        expect(request.planSerial).toBe(serializePlanId(TOPSTEP_50K.id));
        expect(request.optIns).toEqual({
            takesFundedReset: false,
            takesOneTimeEarlyWithdrawal: false,
        });
    });
});

describe('fundedOptimizerPolicyBasis (PT-25b review)', () => {
    it('reports the rulebook default for both cushion and payout request when the calculator has neither', () => {
        const basis = fundedOptimizerPolicyBasis(baseInputs());
        expect(basis.cushion).toBe(FundedPolicyBasis.RulebookDefault);
        expect(basis.payoutRequest).toBe(FundedPolicyBasis.RulebookDefault);
    });

    it('reports a calculator override for the cushion when the calculator sets one', () => {
        const basis = fundedOptimizerPolicyBasis({
            ...baseInputs(),
            retainedCushion: 3500,
        });
        expect(basis.cushion).toBe(FundedPolicyBasis.CalculatorOverride);
        expect(basis.payoutRequest).toBe(FundedPolicyBasis.RulebookDefault);
    });

    it('reports a calculator override for the payout request when the calculator sets one', () => {
        const basis = fundedOptimizerPolicyBasis({
            ...baseInputs(),
            payoutRequestSize: 750,
        });
        expect(basis.cushion).toBe(FundedPolicyBasis.RulebookDefault);
        expect(basis.payoutRequest).toBe(FundedPolicyBasis.CalculatorOverride);
    });
});

describe('fundedOptimizerSweep', () => {
    it('wraps the library sweep: the worker function returns the rows of building the candidates and sweeping them directly (CLI parity is FundedOptimizerCliParity.test.ts)', () => {
        const inputs: FundedOptimizerCalculatorInputs = {
            ...baseInputs(),
            instrument: InstrumentSymbol.NQ,
            stopPoints: 7.5,
            trials: 40,
        };
        const request = fundedOptimizerRequest(inputs, DEFAULT_RULEBOOK);
        const plan = fundedSweepPlan(request);
        if (plan === null) throw new Error('expected a resolvable plan');
        const result = fundedOptimizerSweep(plan, request);
        if (result.kind !== FundedCandidateBuildKind.Built) {
            throw new Error('expected a built sweep');
        }

        const positionSizing = resolvePositionSizing(InstrumentSymbol.NQ, 7.5);
        const build = buildFundedCandidates({
            flat: DEFAULT_FUNDED_FLAT_CANDIDATES,
            fundedLadder: null,
            percent: undefined,
            plan,
            positionSizing,
            stopRule: inputs.dayStop,
        });
        if (build.kind !== FundedCandidateBuildKind.Built) {
            throw new Error('expected the reference build to succeed too');
        }
        const referenceBase = applyEnginePolicy(plan, request.policy, {
            ...request.base,
            plan,
        });
        const referenceRows = runFundedCandidateSweep(
            referenceBase,
            build.candidates,
            FundedSortKey.Monthly,
        );

        const actualRows = fundedOptimizerRows(
            result.rows,
            FundedSortKey.Monthly,
            request.base.trials,
        );
        const expectedRows = fundedOptimizerRows(
            referenceRows,
            FundedSortKey.Monthly,
            request.base.trials,
        );
        expect(actualRows).toEqual(expectedRows);
        expect(actualRows.length).toBeGreaterThan(0);
    });

    it('sorts by both FundedSortKey values', () => {
        const inputs: FundedOptimizerCalculatorInputs = {
            ...baseInputs(),
            instrument: InstrumentSymbol.NQ,
            stopPoints: 7.5,
        };
        const request = fundedOptimizerRequest(inputs, DEFAULT_RULEBOOK);
        const plan = requirePlan(
            fundedSweepPlan(request),
            'expected the built request to resolve a plan',
        );
        const result = fundedOptimizerSweep(plan, request);
        if (result.kind !== FundedCandidateBuildKind.Built) {
            throw new Error('expected a built sweep');
        }
        for (const sort of [FundedSortKey.Monthly, FundedSortKey.Cycle]) {
            const rows = fundedOptimizerRows(
                result.rows,
                sort,
                request.base.trials,
            );
            expect(rows.length).toBe(result.rows.length);
            for (const row of rows) {
                expect(row.cells.length).toBeGreaterThan(0);
            }
        }
    });

    it('gives every estimated column of every row its standard error, and the policy label none (F-27 (3), (7))', () => {
        const inputs: FundedOptimizerCalculatorInputs = {
            ...baseInputs(),
            instrument: InstrumentSymbol.NQ,
            stopPoints: 7.5,
        };
        const request = fundedOptimizerRequest(inputs, DEFAULT_RULEBOOK);
        const plan = requirePlan(
            fundedSweepPlan(request),
            'expected the built request to resolve a plan',
        );
        const result = fundedOptimizerSweep(plan, request);
        if (result.kind !== FundedCandidateBuildKind.Built) {
            throw new Error('expected a built sweep');
        }
        const rows = fundedOptimizerRows(
            result.rows,
            FundedSortKey.Monthly,
            request.base.trials,
        );
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
            expect(row.standardErrors).toHaveLength(row.cells.length);
            expect(row.standardErrors[0]).toBeNull();
            expect(row.standardErrors.slice(1)).not.toContain(null);
        }
    });

    it('formats each standard error like its column: money, percent and a survivor count', () => {
        const out = {
            ...SORT_ROW_OUTPUTS,
            estimates: {
                ...SORT_ROW_OUTPUTS.estimates,
                expectedHorizonCredit: { standardError: 12.4, value: 100 },
                expectedMonthlyNet: { standardError: 345.6, value: 100 },
                expectedMonthlyRealizedNet: { standardError: 78.9, value: 100 },
                expectedNet: { standardError: 1234.5, value: 100 },
                fundedBustProbability: { standardError: 0.025, value: 0.5 },
                fundedSurvivalProbability: { standardError: 0.05, value: 0.5 },
            },
        };
        expect(fundedRowStandardErrors(out, 200)).toStrictEqual([
            null,
            formatCurrency(1234.5),
            formatCurrency(12.4),
            formatCurrency(345.6),
            formatCurrency(78.9),
            formatPercent(0.025),
            '10.0',
        ]);
    });

    it('leaves out percent rows with a note when no instrument or stop is chosen', () => {
        const request = fundedOptimizerRequest(baseInputs(), DEFAULT_RULEBOOK);
        const plan = requirePlan(
            fundedSweepPlan(request),
            'expected the built request to resolve a plan',
        );
        const result = fundedOptimizerSweep(plan, request);
        if (result.kind !== FundedCandidateBuildKind.Built) {
            throw new Error('expected a built sweep');
        }
        expect(result.notes).toContain(PERCENT_CANDIDATES_NEED_STOP_NOTE);
        for (const row of result.rows) {
            expect(row.candidate.label).not.toContain('% cushion');
        }
    });

    it('leaves out flat candidates below one contract, with the lifted note', () => {
        const inputs: FundedOptimizerCalculatorInputs = {
            ...baseInputs(),
            instrument: InstrumentSymbol.NQ,
            stopPoints: 750,
        };
        const request = fundedOptimizerRequest(inputs, DEFAULT_RULEBOOK);
        const plan = requirePlan(
            fundedSweepPlan(request),
            'expected the built request to resolve a plan',
        );
        const result = fundedOptimizerSweep(plan, request);
        if (result.kind !== FundedCandidateBuildKind.Built) {
            throw new Error('expected a built sweep');
        }
        expect(result.rows.length).toBeLessThan(
            DEFAULT_FUNDED_FLAT_CANDIDATES.length,
        );
        expect(result.notes.some((note) => note.includes('left out'))).toBe(
            true,
        );
    });

    it('clamps trials to the stated maximum', () => {
        const inputs: FundedOptimizerCalculatorInputs = {
            ...baseInputs(),
            trials: 999_999,
        };
        const request = fundedOptimizerRequest(inputs, DEFAULT_RULEBOOK);
        expect(request.base.trials).toBeLessThan(999_999);
    });
});

function withRulebookPayout(
    rulebook: RulebookParameters,
    requestCents: number,
): RulebookParameters {
    return {
        ...rulebook,
        payout: { ...rulebook.payout, requestCents },
    };
}

describe('fundedOptimizerRequest with a custom rulebook', () => {
    it('uses the rulebook payout request size, not a hardcoded $500', () => {
        const rulebook = withRulebookPayout(DEFAULT_RULEBOOK, 75_000);
        const request = fundedOptimizerRequest(baseInputs(), rulebook);
        expect(request.base.payoutRequestSize).toBe(750);
    });
});

const SORT_ROW_TRIALS = 20;

const SORT_ROW_OUTPUTS = simulate({
    fundedHorizonDays: 20,
    maxEvalDays: 20,
    plan: TOPSTEP_50K,
    riskPerTrade: 250,
    rrRatio: 2,
    seed: 1,
    tradesPerDay: 4,
    trials: SORT_ROW_TRIALS,
    winrate: 0.5,
});

function fundedRowsWith(
    figures: readonly (readonly [string, number, number])[],
): FundedSweepRow[] {
    return figures.map(([label, monthly, cycle]) => ({
        candidate: { label, overrides: {} },
        out: {
            ...SORT_ROW_OUTPUTS,
            expectedMonthlyNet: monthly,
            expectedNet: cycle,
        },
    }));
}

describe('fundedOptimizerRanking makes the shared objective the sort (PT-83, F-V15)', () => {
    it('maps MonthlyNet to the monthly sort and names it in the heading', () => {
        const ranking = fundedOptimizerRanking(SizingObjective.MonthlyNet);
        expect(ranking.sort).toBe(FundedSortKey.Monthly);
        expect(ranking.heading).toBe('Funded optimizer, ranked by monthly net');
    });

    it('maps CycleCash to the cycle sort and names it in the heading', () => {
        const ranking = fundedOptimizerRanking(SizingObjective.CycleCash);
        expect(ranking.sort).toBe(FundedSortKey.Cycle);
        expect(ranking.heading).toBe('Funded optimizer, ranked by cycle cash');
    });

    it('keeps RuinFirst on the monthly sort and names monthly net, never ruin first (Hard Rule 3)', () => {
        const ranking = fundedOptimizerRanking(SizingObjective.RuinFirst);
        expect(ranking.sort).toBe(FundedSortKey.Monthly);
        expect(ranking.heading).toBe('Funded optimizer, ranked by monthly net');
    });

    it('sorts the swept rows by cycle net under CycleCash and by monthly net under MonthlyNet', () => {
        const rows = fundedRowsWith([
            ['high-monthly', 300, 100],
            ['high-cycle', 100, 300],
            ['middle', 200, 200],
        ]);
        const labelsOf = (objective: SizingObjective) =>
            fundedOptimizerRows(
                rows,
                fundedOptimizerRanking(objective).sort,
                SORT_ROW_TRIALS,
            ).map((row) => row.cells[0]);
        expect(labelsOf(SizingObjective.CycleCash)).toStrictEqual([
            'high-cycle',
            'middle',
            'high-monthly',
        ]);
        expect(labelsOf(SizingObjective.MonthlyNet)).toStrictEqual([
            'high-monthly',
            'middle',
            'high-cycle',
        ]);
        expect(labelsOf(SizingObjective.RuinFirst)).toStrictEqual([
            'high-monthly',
            'middle',
            'high-cycle',
        ]);
    });
});

describe('fundedOptimizerRequest carries the hazard and says when it reduced the trials (F-27 (1), (5))', () => {
    it('sends no hazard when the calculator hazard is 0, as the CLI does without the flag', () => {
        const request = fundedOptimizerRequest(baseInputs(), DEFAULT_RULEBOOK);
        expect(request.base.liveTransferHazard).toBeUndefined();
    });

    it('sends the calculator hazard as a fraction', () => {
        const request = fundedOptimizerRequest(
            { ...baseInputs(), liveTransferHazard: 0.25 },
            DEFAULT_RULEBOOK,
        );
        expect(request.base.liveTransferHazard).toBe(fraction(0.25));
    });

    it('says nothing when the trial count fits the sweep maximum', () => {
        expect(fundedOptimizerTrialsNote(4000)).toBeNull();
        expect(fundedOptimizerTrialsNote(MAX_FUNDED_SWEEP_TRIALS)).toBeNull();
    });

    it('names the requested and the run trial count when the maximum cut it', () => {
        const note = fundedOptimizerTrialsNote(20_000);
        expect(note).toContain('20,000');
        expect(note).toContain('5,000');
    });
});

describe('fundedOptimizerLiveTransferLines (F-27 (5))', () => {
    const rows = fundedRowsWith([['flat $200', 100, 100]]);

    it('prints nothing without a hazard', () => {
        expect(
            fundedOptimizerLiveTransferLines(TOPSTEP_50K, 0, rows),
        ).toStrictEqual([]);
    });

    it('prints the hazard as an assumption and the continuation notes of the plan under a hazard', () => {
        const [first, ...rest] = fundedOptimizerLiveTransferLines(
            TOPSTEP_50K,
            0.25,
            rows,
        );
        expect(first).toContain('25');
        expect(first).toContain('your assumption, not a firm rule');
        expect(rest.join(' ')).toContain(
            LIVE_TRANSFER_CONTINUATION_TEXT[
                rows[0]?.out.liveTransferContinuation ??
                    LiveTransferContinuationKind.Off
            ],
        );
    });

    it('prints nothing when there are no rows to read the continuation from', () => {
        expect(
            fundedOptimizerLiveTransferLines(TOPSTEP_50K, 0.25, []),
        ).toStrictEqual([]);
    });
});

describe('fundedOptimizerSweep reports one progress step per candidate (F-27 (10))', () => {
    it('calls back after every candidate with the running count and the total', () => {
        const request = fundedOptimizerRequest(
            { ...baseInputs(), trials: 10 },
            DEFAULT_RULEBOOK,
        );
        const plan = requirePlan(
            fundedSweepPlan(request),
            'expected the built request to resolve a plan',
        );
        const steps: { completed: number; total: number }[] = [];
        const result = fundedOptimizerSweep(plan, request, (step) => {
            steps.push(step);
        });
        if (result.kind !== FundedCandidateBuildKind.Built) {
            throw new Error('expected a built sweep');
        }
        expect(steps.map((step) => step.completed)).toStrictEqual(
            result.rows.map((_, index) => index + 1),
        );
        expect(new Set(steps.map((step) => step.total))).toStrictEqual(
            new Set([result.rows.length]),
        );
    });
});
