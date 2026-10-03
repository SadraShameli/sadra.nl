import { describe, expect, it } from 'vitest';

import { DpNotValidatedCause } from '~/lib/prop-calculator/advisor';
import {
    DP_GATE_MIN_ITERATIONS,
    type DpGateBasis,
    DpEvalObjective,
    DpGateFailure,
    type DpGateRun,
    dpNotValidatedCauseOf,
    evaluateDpGateRun,
} from '~/lib/prop-calculator/advisor/dp';
import { InstrumentSymbol, PayoutRequestPolicy } from '~/lib/prop-calculator/core';
import { RateSearchStatus } from '~/lib/prop-calculator/core/AverageRewardSolver';

const G2 = '2026-10-01';

const BASIS: DpGateBasis = {
    instrument: InstrumentSymbol.MES,
    payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
    payoutRequestSize: 500,
    retainedCushion: 2000,
    stopPoints: 10,
};

function run(overrides: Partial<DpGateRun> = {}): DpGateRun {
    return {
        citation: {
            date: '2026-10-05',
            file: 'engine-results/2026-10-05-dp-gate.md',
            row: 'topstep no-fee-standard',
        },
        dp: { creditFree: 3300, creditInclusive: 3400 },
        dpBasis: BASIS,
        engineRef: 'be4620b3',
        evalObjective: DpEvalObjective.CashAtPass,
        flat: { creditFree: 3200, creditInclusive: 3300 },
        flatBasis: BASIS,
        planSerial: 'topstep:50000:no-fee-standard',
        ranOn: '2026-10-05',
        solve: {
            exitCode: 0,
            iterations: 12,
            status: RateSearchStatus.Converged,
            unconvergedLevels: 0,
        },
        ...overrides,
    };
}

describe('evaluateDpGateRun', () => {
    it('validates a fresh, converged, matched run that beats the best flat on both monthly nets', () => {
        const verdict = evaluateDpGateRun(run(), G2);

        expect(verdict).toEqual({
            citation: run().citation,
            evalObjective: DpEvalObjective.CashAtPass,
            ratios: {
                creditFree: 3300 / 3200,
                creditInclusive: 3400 / 3300,
            },
            validated: true,
        });
    });

    it('validates a run that exactly equals the best flat (at least as good, Q38 default)', () => {
        const verdict = evaluateDpGateRun(
            run({
                dp: { creditFree: 3200, creditInclusive: 3300 },
            }),
            G2,
        );

        expect(verdict.validated).toBe(true);
    });

    it('names the 0.99x result when the credit-inclusive net is just below the best flat', () => {
        const verdict = evaluateDpGateRun(
            run({
                dp: { creditFree: 3300, creditInclusive: 3101 },
                flat: { creditFree: 3200, creditInclusive: 3142 },
            }),
            G2,
        );

        expect(verdict).toEqual({
            citation: run().citation,
            failure: DpGateFailure.BelowBestFlat,
            result: '0.99x best flat (credit-inclusive)',
            validated: false,
        });
    });

    it('fails on the credit-free net alone: both metrics must pass (Q1 default)', () => {
        const verdict = evaluateDpGateRun(
            run({
                dp: { creditFree: 3000, creditInclusive: 3400 },
                flat: { creditFree: 3200, creditInclusive: 3300 },
            }),
            G2,
        );

        expect(verdict).toMatchObject({
            failure: DpGateFailure.BelowBestFlat,
            result: '0.94x best flat (credit-free)',
            validated: false,
        });
    });

    it('names dollars instead of a ratio when the best flat is not positive', () => {
        const verdict = evaluateDpGateRun(
            run({
                dp: { creditFree: -120, creditInclusive: -100 },
                flat: { creditFree: -50, creditInclusive: -40 },
            }),
            G2,
        );

        expect(verdict).toMatchObject({
            failure: DpGateFailure.BelowBestFlat,
            result: '-$100 against a best flat of -$40 (credit-inclusive)',
            validated: false,
        });
    });

    it.each([
        [
            'the status is solve-cap-reached',
            { status: RateSearchStatus.SolveCapReached },
            'solve-cap-reached',
        ],
        [
            'a funded level did not converge',
            { unconvergedLevels: 3 },
            '3 unconverged funded levels',
        ],
        ['the exit code is 1', { exitCode: 1 }, 'exit 1'],
        [
            'it ran 8 iterations',
            { iterations: 8 },
            `8 of ${DP_GATE_MIN_ITERATIONS} iterations`,
        ],
    ] as const)(
        'is not validated when %s',
        (_label, solveOverride, expectedResult) => {
            const verdict = evaluateDpGateRun(
                run({ solve: { ...run().solve, ...solveOverride } }),
                G2,
            );

            expect(verdict).toEqual({
                citation: run().citation,
                failure: DpGateFailure.SolveNotConverged,
                result: expectedResult,
                validated: false,
            });
        },
    );

    it('requires at least 12 iterations', () => {
        expect(DP_GATE_MIN_ITERATIONS).toBe(12);
        expect(
            evaluateDpGateRun(
                run({ solve: { ...run().solve, iterations: 12 } }),
                G2,
            ).validated,
        ).toBe(true);
    });

    it('is not validated when the DP and the flat baseline used different retained cushions (the 2026-09-23 TopStep case)', () => {
        const verdict = evaluateDpGateRun(
            run({ dpBasis: { ...BASIS, retainedCushion: 0 } }),
            G2,
        );

        expect(verdict).toEqual({
            citation: run().citation,
            failure: DpGateFailure.RetainedCushionMismatch,
            result: 'DP retained cushion $0 against the flat baseline $2,000',
            validated: false,
        });
    });

    it.each([
        [
            'payout policy',
            { payoutRequestPolicy: PayoutRequestPolicy.UpToRequest },
            DpGateFailure.PayoutPolicyMismatch,
        ],
        [
            'payout request size',
            { payoutRequestSize: 300 },
            DpGateFailure.PayoutPolicyMismatch,
        ],
        [
            'instrument',
            { instrument: InstrumentSymbol.ES },
            DpGateFailure.InstrumentMismatch,
        ],
        ['stop', { stopPoints: 12 }, DpGateFailure.StopMismatch],
    ] as const)(
        'is not validated when the %s differs between the DP and the flat baseline',
        (_label, basisOverride, failure) => {
            const verdict = evaluateDpGateRun(
                run({ flatBasis: { ...BASIS, ...basisOverride } }),
                G2,
            );

            expect(verdict).toMatchObject({ failure, validated: false });
        },
    );

    it('is not validated for a run dated on or before G2, or while G2 is not recorded (stale tree)', () => {
        for (const ranOn of ['2026-09-30', G2]) {
            expect(evaluateDpGateRun(run({ ranOn }), G2)).toMatchObject({
                failure: DpGateFailure.StaleTree,
                validated: false,
            });
        }
        expect(evaluateDpGateRun(run(), null)).toMatchObject({
            failure: DpGateFailure.StaleTree,
            validated: false,
        });
    });

    it('is not validated without an engine commit or content hash', () => {
        for (const engineRef of ['', '   ']) {
            expect(evaluateDpGateRun(run({ engineRef }), G2)).toMatchObject({
                failure: DpGateFailure.StaleTree,
                validated: false,
            });
        }
    });

    it('checks staleness before convergence, and convergence before the basis and the ratio', () => {
        const everythingWrong = run({
            dp: { creditFree: 1, creditInclusive: 1 },
            dpBasis: { ...BASIS, retainedCushion: 0 },
            ranOn: '2026-09-01',
            solve: { ...run().solve, exitCode: 1 },
        });

        expect(evaluateDpGateRun(everythingWrong, G2)).toMatchObject({
            failure: DpGateFailure.StaleTree,
        });
        expect(
            evaluateDpGateRun({ ...everythingWrong, ranOn: '2026-10-05' }, G2),
        ).toMatchObject({ failure: DpGateFailure.SolveNotConverged });
        expect(
            evaluateDpGateRun(
                {
                    ...everythingWrong,
                    ranOn: '2026-10-05',
                    solve: run().solve,
                },
                G2,
            ),
        ).toMatchObject({ failure: DpGateFailure.RetainedCushionMismatch });
    });

    it('carries the eval objective of a validated run so a pass-probability verdict can be told apart', () => {
        const verdict = evaluateDpGateRun(
            run({ evalObjective: DpEvalObjective.PassProbability }),
            G2,
        );

        expect(verdict).toMatchObject({
            evalObjective: DpEvalObjective.PassProbability,
            validated: true,
        });
    });
});

describe('dpNotValidatedCauseOf', () => {
    it('maps the failures PT-19 already has a cause for and leaves the rest null', () => {
        expect(
            Object.values(DpGateFailure).map((failure) => [
                failure,
                dpNotValidatedCauseOf(failure),
            ]),
        ).toEqual([
            [DpGateFailure.BelowBestFlat, null],
            [DpGateFailure.InstrumentMismatch, null],
            [DpGateFailure.NoGateRun, DpNotValidatedCause.NoGateRun],
            [DpGateFailure.PayoutPolicyMismatch, null],
            [
                DpGateFailure.RetainedCushionMismatch,
                DpNotValidatedCause.RetainedCushionMismatch,
            ],
            [
                DpGateFailure.SolveNotConverged,
                DpNotValidatedCause.SolveCapReached,
            ],
            [DpGateFailure.StaleTree, DpNotValidatedCause.StaleTree],
            [DpGateFailure.StopMismatch, null],
        ]);
    });
});
