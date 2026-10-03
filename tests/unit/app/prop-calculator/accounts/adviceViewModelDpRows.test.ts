import { describe, expect, it } from 'vitest';

import {
    DP_ADVICE_ROWS_SHOWN,
    type DpAdviceRecordInput,
    dpAdviceRowViewsOf,
    DpSamplesViewKind,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceViewModel';
import {
    dollars,
    FundedDpModelGapKind,
    InstrumentSymbol,
} from '~/lib/prop-calculator';
import {
    DpAdviceGap,
    DpAdviceStalenessReason,
    DpSamplesKind,
    DpSampleStage,
    DpSamplesUnavailableReason,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';
import { DpGateFailureCode } from '~/lib/prop-calculator/advisor/DpAdviceRow';
import { fundedDpModelGapClause } from '~/lib/prop-calculator/advisor/DpAdviceText';
import { DpValueStateKind } from '~/lib/schemas/propAccountOutputs';

const CONFIG_KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

function onlyRow(input: DpAdviceRecordInput) {
    const { rows } = dpAdviceRowViewsOf([input]);
    const [row] = rows;
    if (row === undefined || rows.length !== 1) {
        throw new Error('expected exactly one DP row view');
    }
    return row;
}

function record(
    overrides: Partial<DpAdviceRecordInput> = {},
): DpAdviceRecordInput {
    return {
        assumedInstrument: null,
        assumedStopPoints: null,
        configKey: CONFIG_KEY,
        eligible: true,
        gaps: [],
        gateFailure: DpGateFailureCode.NoGateRun,
        gateResult: null,
        id: 'advice-1',
        ineligibleReason: null,
        objective: SizingObjective.MonthlyNet,
        runtimeMs: 12_300,
        samples: {
            kind: DpSamplesKind.Sampled,
            samples: [
                {
                    cushionCents: 200_000,
                    placedRiskCents: 40_000,
                    riskCents: 45_000,
                    rungOffset: 0,
                    tradeIndex: 0,
                },
                {
                    cushionCents: 200_000,
                    placedRiskCents: 20_000,
                    riskCents: 25_000,
                    rungOffset: 0,
                    tradeIndex: 1,
                },
                {
                    cushionCents: 300_000,
                    placedRiskCents: 60_000,
                    riskCents: 62_500,
                    rungOffset: 1,
                    tradeIndex: 0,
                },
            ],
            stage: DpSampleStage.Funded,
        },
        solvedAt: new Date('2026-10-02T09:30:00Z'),
        solverVersion: 1,
        staleness: [],
        validated: false,
        validationRef: null,
        valueSamples: [],
        ...overrides,
    };
}

describe('dpAdviceRowViewsOf', () => {
    it('states that an unvalidated row is not validated and must not size an account, with the stored gate failure', () => {
        const row = onlyRow(record());
        expect(row.isValidated).toBe(false);
        expect(row.validationText).toBe(
            'Not validated: no gate run is recorded for this plan. Treat these figures as an unvalidated estimate, never as the sizing rule.',
        );
    });

    it('prints the stored gate result text after the failure instead of a generic line', () => {
        const row = onlyRow(
            record({
                gateFailure: DpGateFailureCode.BelowBestFlat,
                gateResult: '0.99x best flat (credit-free)',
            }),
        );
        expect(row.validationText).toBe(
            'Not validated: the gate run is below the best flat policy: 0.99x best flat (credit-free). Treat these figures as an unvalidated estimate, never as the sizing rule.',
        );
        expect(row.validationText).not.toContain(
            'no recorded gate run had passed',
        );
    });

    it('prints the solve cap result for a gate run that did not converge', () => {
        const row = onlyRow(
            record({
                gateFailure: DpGateFailureCode.SolveNotConverged,
                gateResult: 'solve-cap-reached',
            }),
        );
        expect(row.validationText).toBe(
            'Not validated: the gate run solve did not converge: solve-cap-reached. Treat these figures as an unvalidated estimate, never as the sizing rule.',
        );
    });

    it('says a row stored before the gate result was kept has no stored gate result, instead of guessing one', () => {
        const row = onlyRow(record({ gateFailure: null, gateResult: null }));
        expect(row.validationText).toBe(
            'Not validated: the gate result was not stored with this row. Treat these figures as an unvalidated estimate, never as the sizing rule.',
        );
    });

    it('says an ineligible row has no gate run to report', () => {
        const row = onlyRow(
            record({
                eligible: false,
                gateFailure: null,
                gateResult: null,
                ineligibleReason: 'Plan is instant-funded.',
            }),
        );
        expect(row.validationText).toBe(
            'Not validated: the plan is not DP-eligible, so no gate run applies. Treat these figures as an unvalidated estimate, never as the sizing rule.',
        );
    });

    it('cites the gate row for a validated row', () => {
        const row = onlyRow(
            record({
                validated: true,
                validationRef: 'engine-results/2026-10-05-dp-gate.md#row-3',
            }),
        );
        expect(row.isValidated).toBe(true);
        expect(row.validationText).toBe(
            'Validated by engine-results/2026-10-05-dp-gate.md#row-3.',
        );
    });

    it('says a validated row has no citation instead of inventing one', () => {
        const row = onlyRow(record({ validated: true, validationRef: null }));
        expect(row.validationText).toBe(
            'Validated by a recorded gate run (no citation was stored).',
        );
    });

    it('shows eligibility from the typed fields and the stored reason for an ineligible row', () => {
        expect(onlyRow(record()).eligibilityText).toBe(
            'Eligible for the DP solve.',
        );
        const ineligible = onlyRow(
            record({
                eligible: false,
                ineligibleReason:
                    'Plan is instant-funded, so there is no eval phase.',
                samples: {
                    kind: DpSamplesKind.Unavailable,
                    reason: DpSamplesUnavailableReason.NotEligible,
                    stage: DpSampleStage.Funded,
                },
            }),
        );
        expect(ineligible.eligibilityText).toBe(
            'Not eligible for the DP solve: Plan is instant-funded, so there is no eval phase.',
        );
        expect(ineligible.samples).toEqual({
            kind: DpSamplesViewKind.Unavailable,
            text: 'DP risk is not shown: the plan is not DP-eligible.',
        });
    });

    it('prints intended and placed risk per rung offset in dollars, with the placement assumption', () => {
        const row = onlyRow(record());
        expect(row.samples).toEqual({
            kind: DpSamplesViewKind.Sampled,
            lines: [
                {
                    cushionText: '$2,000.00',
                    label: 'At your state',
                    riskTexts: [
                        'Trade 1: $450.00 intended, $400.00 placed',
                        'Trade 2: $250.00 intended, $200.00 placed',
                    ],
                },
                {
                    cushionText: '$3,000.00',
                    label: '1 documented rung up',
                    riskTexts: ['Trade 1: $625.00 intended, $600.00 placed'],
                },
            ],
            stageText: 'Funded risk per trade, after each loss in order',
        });
        expect(row.assumptionTexts).toEqual([
            'Placed risk is whole contracts at the instrument and stop the solve assumed. Neither is stored with this row, so it does not follow the instrument and stop entered above.',
        ]);
    });

    it('names the stored instrument and stop as the solve assumptions, not the ones entered above', () => {
        const row = onlyRow(
            record({
                assumedInstrument: InstrumentSymbol.MNQ,
                assumedStopPoints: 12.5,
            }),
        );
        expect(row.assumptionTexts).toEqual([
            'Placed risk is whole contracts of MNQ with a 12.5-point stop, the instrument and stop the solve assumed. It does not follow the instrument and stop entered above.',
        ]);
    });

    it('names the stored instrument and stop even when no risk samples are shown', () => {
        const row = onlyRow(
            record({
                assumedInstrument: InstrumentSymbol.ES,
                assumedStopPoints: 4,
                samples: {
                    kind: DpSamplesKind.Unavailable,
                    reason: DpSamplesUnavailableReason.EvalRowsSuppressed,
                    stage: DpSampleStage.Eval,
                },
            }),
        );
        expect(row.assumptionTexts).toEqual([
            'Placed risk is whole contracts of ES with a 4-point stop, the instrument and stop the solve assumed. It does not follow the instrument and stop entered above.',
        ]);
    });

    it('prints intended risk only when no placement was solved, and adds no placement assumption', () => {
        const row = onlyRow(
            record({
                gaps: [{ kind: DpAdviceGap.ContinuousRiskAssumed }],
                samples: {
                    kind: DpSamplesKind.Sampled,
                    samples: [
                        {
                            cushionCents: 150_000,
                            placedRiskCents: null,
                            riskCents: 33_300,
                            rungOffset: -2,
                            tradeIndex: 0,
                        },
                    ],
                    stage: DpSampleStage.Eval,
                },
            }),
        );
        expect(row.samples).toEqual({
            kind: DpSamplesViewKind.Sampled,
            lines: [
                {
                    cushionText: '$1,500.00',
                    label: '2 documented rungs down',
                    riskTexts: ['Trade 1: $333.00'],
                },
            ],
            stageText: 'Eval risk per trade, after each loss in order',
        });
        expect(row.assumptionTexts).toEqual([]);
    });

    it.each([
        [
            DpSamplesUnavailableReason.EvalDayPastHorizon,
            'the account is past the DP eval horizon',
        ],
        [
            DpSamplesUnavailableReason.EvalElapsedDaysMissing,
            'the snapshot has no elapsed eval days to place the state on the DP day axis',
        ],
        [
            DpSamplesUnavailableReason.EvalRowsSuppressed,
            'eval rows are only shown for a validated plan',
        ],
        [
            DpSamplesUnavailableReason.EvalStateUnreached,
            'the DP never reaches this eval state',
        ],
        [
            DpSamplesUnavailableReason.FundedCycleCountsInvalid,
            'the rebuilt funded cycle has an invalid count',
        ],
        [
            DpSamplesUnavailableReason.FundedLevelUnreachable,
            'the rebuilt funded state is at a level this plan can never reach',
        ],
        [DpSamplesUnavailableReason.NotEligible, 'the plan is not DP-eligible'],
    ])('explains unavailable samples (%s)', (reason, text) => {
        const row = onlyRow(
            record({
                samples: {
                    kind: DpSamplesKind.Unavailable,
                    reason,
                    stage: DpSampleStage.Eval,
                },
            }),
        );
        expect(row.samples).toEqual({
            kind: DpSamplesViewKind.Unavailable,
            text: `DP risk is not shown: ${text}.`,
        });
    });

    it.each([
        [
            { kind: DpAdviceGap.StateAtGridTop },
            'Your state sits at the top of the DP grid, so its risk is clamped there.',
        ],
        [
            { kind: DpAdviceGap.DayStopRuleNotModeled },
            'The documented day stop rule is not modeled by the funded DP.',
        ],
        [
            { kind: DpAdviceGap.ContinuousRiskAssumed },
            'Risk was solved in continuous dollars (no instrument and stop), so it is not placed in whole contracts.',
        ],
        [
            {
                kind: DpAdviceGap.ConsistencyGridTruncates,
                lockedTopCents: 450_000,
            },
            'The consistency rule stops the DP cushion grid at $4,500.00, which truncates any state above it.',
        ],
        [
            {
                drawdownCents: 250_050,
                kind: DpAdviceGap.EvalGridMisaligned,
                stepCents: 10_000,
            },
            'The eval drawdown $2,500.50 is not a whole multiple of the $100.00 cushion step; informational only.',
        ],
    ] as const)('words gap %j from its typed fields', (gap, text) => {
        expect(onlyRow(record({ gaps: [gap] })).gapTexts).toEqual([text]);
    });

    it.each([
        {
            kind: FundedDpModelGapKind.CalendarWeekInactivityIgnored,
            message: 'closes its funded phase for an empty calendar week',
        },
        {
            kind: FundedDpModelGapKind.FundedGridSaturationHigh,
            shareAtOrAboveTop: 0.025,
        },
        {
            kind: FundedDpModelGapKind.LifetimeDollarCapIgnored,
            maxLifetimePayoutDollars: dollars(100_000),
        },
        {
            fromPayoutIndex: 4,
            kind: FundedDpModelGapKind.PayoutCountTierBeyondRegimeCap,
            payoutRegimeCap: 3,
        },
        { kind: FundedDpModelGapKind.PayoutFloorReleaseUnvalidated },
        {
            kind: FundedDpModelGapKind.PayoutTriggeredLockPreLockOffsetSaturates,
        },
    ] as const)(
        'words funded model gap %j with the same clause the CLI prints',
        (gap) => {
            expect(onlyRow(record({ gaps: [gap] })).gapTexts).toEqual([
                `This plan: ${fundedDpModelGapClause(gap)}.`,
            ]);
        },
    );

    it('flags a stale row with one text per reason', () => {
        const fresh = onlyRow(record());
        expect(fresh.isStale).toBe(false);
        expect(fresh.staleTexts).toEqual([]);
        const stale = onlyRow(
            record({
                staleness: [
                    DpAdviceStalenessReason.NewerSnapshot,
                    DpAdviceStalenessReason.PlanRulesChanged,
                    DpAdviceStalenessReason.SolverVersionChanged,
                ],
            }),
        );
        expect(stale.isStale).toBe(true);
        expect(stale.staleTexts).toEqual([
            'A newer balance snapshot exists, so this solve is for an earlier state.',
            "The plan's rules changed since this solve.",
            'The DP solver changed since this solve.',
        ]);
    });

    it('shows value figures only for a validated row and says they are hidden otherwise', () => {
        const valueSamples = [
            {
                kind: DpValueStateKind.Current,
                rateAdjustedValueCents: 123_400,
                riskCents: null,
                valueCents: 250_000,
            },
            {
                kind: DpValueStateKind.AfterWin,
                rateAdjustedValueCents: null,
                riskCents: 40_000,
                valueCents: 270_000,
            },
            {
                kind: DpValueStateKind.AfterLoss,
                rateAdjustedValueCents: null,
                riskCents: 40_000,
                valueCents: 215_000,
            },
            {
                kind: DpValueStateKind.Candidate,
                rateAdjustedValueCents: null,
                riskCents: 55_000,
                valueCents: 260_000,
            },
        ];
        const validated = onlyRow(
            record({
                validated: true,
                validationRef: 'file#row',
                valueSamples,
            }),
        );
        expect(validated.valueTexts).toEqual([
            'Your state: value $2,500.00 (rate-adjusted $1,234.00)',
            'After a win at $400.00: value $2,700.00',
            'After a loss at $400.00: value $2,150.00',
            'Candidate risk $550.00: value $2,600.00',
        ]);
        expect(validated.valueNote).toBeNull();
        const unvalidated = onlyRow(record({ valueSamples }));
        expect(unvalidated.valueTexts).toEqual([]);
        expect(unvalidated.valueNote).toBe(
            'Value figures are stored with this row but are shown only once the DP is validated.',
        );
        expect(onlyRow(record()).valueNote).toBeNull();
    });

    it('says a row stored without a solve was not solved', () => {
        expect(onlyRow(record({ runtimeMs: 0 })).provenanceText).toBe(
            'Recorded 2026-10-02 without a solve, solver 1, config a1b2c3d4e5f6, objective monthly net',
        );
    });

    it('describes the solve from stored fields only', () => {
        expect(onlyRow(record()).provenanceText).toBe(
            'Solved 2026-10-02 in 12.3s, solver 1, config a1b2c3d4e5f6, objective monthly net',
        );
    });

    it('keeps only the newest row per config key, newest first', () => {
        const older = record({
            id: 'older',
            solvedAt: new Date('2026-09-01T00:00:00Z'),
        });
        const newer = record({
            id: 'newer',
            solvedAt: new Date('2026-10-01T00:00:00Z'),
        });
        const other = record({
            configKey: 'ffffffffffffffffffffffffffffffff',
            id: 'other',
            solvedAt: new Date('2026-09-15T00:00:00Z'),
        });
        const { hiddenCount, rows } = dpAdviceRowViewsOf([older, other, newer]);
        expect(rows.map((row) => row.id)).toEqual(['newer', 'other']);
        expect(hiddenCount).toBe(0);
    });

    it('counts the rows beyond the display cap instead of dropping them silently', () => {
        const many = Array.from({ length: DP_ADVICE_ROWS_SHOWN + 2 }, (_, i) =>
            record({
                configKey: `key-${String(i).padStart(2, '0')}`,
                id: `row-${String(i)}`,
                solvedAt: new Date(Date.UTC(2026, 9, 1 + i)),
            }),
        );
        const { hiddenCount, hiddenText, rows } = dpAdviceRowViewsOf(many);
        expect(rows).toHaveLength(DP_ADVICE_ROWS_SHOWN);
        expect(hiddenCount).toBe(2);
        expect(hiddenText).toBe(
            '2 more DP solves with other settings are not shown.',
        );
        expect(
            dpAdviceRowViewsOf(many.slice(0, DP_ADVICE_ROWS_SHOWN + 1))
                .hiddenText,
        ).toBe('1 more DP solve with other settings is not shown.');
        expect(rows[0]?.id).toBe(`row-${String(DP_ADVICE_ROWS_SHOWN + 1)}`);
    });

    it('is empty for no records', () => {
        expect(dpAdviceRowViewsOf([])).toEqual({
            hiddenCount: 0,
            hiddenText: null,
            rows: [],
        });
    });
});
