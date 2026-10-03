import { describe, expect, it } from 'vitest';

import {
    DP_ADVICE_SOLVER_VERSION,
    DpAdviceGap,
    type DpAdviceGapEntry,
    dpAdviceGapsSchema,
    type DpAdviceRow,
    type DpAdviceSamples,
    dpAdviceSamplesSchema,
    dpAdviceStaleness,
    DpAdviceStalenessReason,
    DpSamplesKind,
    DpSampleStage,
    DpSamplesUnavailableReason,
} from '~/lib/prop-calculator/advisor/DpAdviceRow';
import { SizingObjective } from '~/lib/prop-calculator/advisor/SizingObjective';
import { dollars, FundedDpModelGapKind } from '~/lib/prop-calculator/core';

const FINGERPRINT = 'a'.repeat(64);
const OTHER_FINGERPRINT = 'b'.repeat(64);

const SAMPLED: DpAdviceSamples = {
    kind: DpSamplesKind.Sampled,
    samples: [
        {
            cushionCents: 150_000,
            placedRiskCents: 40_000,
            riskCents: 45_000,
            rungOffset: -1,
            tradeIndex: 2,
        },
        {
            cushionCents: 250_000,
            placedRiskCents: null,
            riskCents: 51_234,
            rungOffset: 0,
            tradeIndex: 0,
        },
    ],
    stage: DpSampleStage.Funded,
};

function fresh() {
    return {
        currentPlanRulesFingerprint: FINGERPRINT,
        latestSnapshotId: 'snapshot-1',
    };
}

function row(overrides: Partial<DpAdviceRow> = {}): DpAdviceRow {
    return {
        configKey: 'c'.repeat(64),
        eligible: true,
        gaps: [],
        ineligibleReason: null,
        objective: SizingObjective.MonthlyNet,
        planRulesFingerprint: FINGERPRINT,
        planSerial: 'topstep:50000:standard-standard',
        runtimeMs: 1200,
        samples: SAMPLED,
        snapshotId: 'snapshot-1',
        solvedAt: '2026-10-03T08:00:00.000Z',
        solverVersion: DP_ADVICE_SOLVER_VERSION,
        validated: false,
        validationRef: null,
        ...overrides,
    };
}

describe('dpAdviceStaleness', () => {
    it('is fresh for the latest snapshot, the current solver version and an unchanged fingerprint', () => {
        expect(dpAdviceStaleness(row(), fresh())).toEqual([]);
    });

    it('is stale when a newer snapshot exists', () => {
        expect(
            dpAdviceStaleness(row(), {
                ...fresh(),
                latestSnapshotId: 'snapshot-2',
            }),
        ).toEqual([DpAdviceStalenessReason.NewerSnapshot]);
    });

    it('is stale when the row was solved by a different solver version, in either direction', () => {
        expect(
            dpAdviceStaleness(
                row({ solverVersion: DP_ADVICE_SOLVER_VERSION - 1 }),
                fresh(),
            ),
        ).toEqual([DpAdviceStalenessReason.SolverVersionChanged]);
        expect(
            dpAdviceStaleness(
                row({ solverVersion: DP_ADVICE_SOLVER_VERSION + 1 }),
                fresh(),
            ),
        ).toEqual([DpAdviceStalenessReason.SolverVersionChanged]);
    });

    it('compares against an explicit current solver version when given', () => {
        expect(
            dpAdviceStaleness(row({ solverVersion: 7 }), {
                ...fresh(),
                currentSolverVersion: 7,
            }),
        ).toEqual([]);
    });

    it('is stale when the plan-rule fingerprint changed since the solve', () => {
        expect(
            dpAdviceStaleness(row(), {
                ...fresh(),
                currentPlanRulesFingerprint: OTHER_FINGERPRINT,
            }),
        ).toEqual([DpAdviceStalenessReason.PlanRulesChanged]);
    });

    it('does not call a row stale for a fingerprint it never stored', () => {
        expect(
            dpAdviceStaleness(row({ planRulesFingerprint: null }), {
                ...fresh(),
                currentPlanRulesFingerprint: OTHER_FINGERPRINT,
            }),
        ).toEqual([]);
    });

    it('lists every reason, in a fixed order', () => {
        expect(
            dpAdviceStaleness(
                row({ solverVersion: DP_ADVICE_SOLVER_VERSION + 1 }),
                {
                    currentPlanRulesFingerprint: OTHER_FINGERPRINT,
                    latestSnapshotId: 'snapshot-9',
                },
            ),
        ).toEqual([
            DpAdviceStalenessReason.NewerSnapshot,
            DpAdviceStalenessReason.SolverVersionChanged,
            DpAdviceStalenessReason.PlanRulesChanged,
        ]);
    });
});

describe('the row gap type is the leaf enum plus the advice gaps', () => {
    it('keeps the two enums disjoint so a stored kind names one gap', () => {
        const modelKinds: string[] = Object.values(FundedDpModelGapKind);
        const adviceKinds: string[] = Object.values(DpAdviceGap);

        expect(adviceKinds.filter((kind) => modelKinds.includes(kind))).toEqual(
            [],
        );
    });

    it('round-trips every model gap and every advice gap through the schema', () => {
        const gaps: DpAdviceGapEntry[] = [
            {
                fromPayoutIndex: 6,
                kind: FundedDpModelGapKind.PayoutCountTierBeyondRegimeCap,
                payoutRegimeCap: 6,
            },
            {
                kind: FundedDpModelGapKind.CalendarWeekInactivityIgnored,
                message: 'an empty week closes the phase',
            },
            {
                kind: FundedDpModelGapKind.FundedGridSaturationHigh,
                shareAtOrAboveTop: 0.02,
            },
            {
                kind: FundedDpModelGapKind.LifetimeDollarCapIgnored,
                maxLifetimePayoutDollars: dollars(90_000),
            },
            { kind: FundedDpModelGapKind.PayoutFloorReleaseUnvalidated },
            {
                kind: FundedDpModelGapKind.PayoutTriggeredLockPreLockOffsetSaturates,
            },
            {
                kind: DpAdviceGap.ConsistencyGridTruncates,
                lockedTopCents: 1_200_000,
            },
            { kind: DpAdviceGap.ContinuousRiskAssumed },
            { kind: DpAdviceGap.DayStopRuleNotModeled },
            {
                drawdownCents: 175_000,
                kind: DpAdviceGap.EvalGridMisaligned,
                stepCents: 20_000,
            },
            { kind: DpAdviceGap.StateAtGridTop },
        ];

        expect(dpAdviceGapsSchema.parse(gaps)).toEqual(gaps);
    });

    it('rejects a gap kind it does not know and a non-integer cent amount', () => {
        expect(
            dpAdviceGapsSchema.safeParse([{ kind: 'made-up-gap' }]).success,
        ).toBe(false);
        expect(
            dpAdviceGapsSchema.safeParse([
                {
                    drawdownCents: 1750.5,
                    kind: DpAdviceGap.EvalGridMisaligned,
                    stepCents: 200,
                },
            ]).success,
        ).toBe(false);
    });
});

describe('dpAdviceSamplesSchema', () => {
    it('round-trips sampled and unavailable samples', () => {
        const unavailable: DpAdviceSamples = {
            kind: DpSamplesKind.Unavailable,
            reason: DpSamplesUnavailableReason.EvalRowsSuppressed,
            stage: DpSampleStage.Eval,
        };

        expect(dpAdviceSamplesSchema.parse(SAMPLED)).toEqual(SAMPLED);
        expect(dpAdviceSamplesSchema.parse(unavailable)).toEqual(unavailable);
    });

    it('rejects a fractional cent risk, a negative trade index and an unknown reason', () => {
        expect(
            dpAdviceSamplesSchema.safeParse({
                ...SAMPLED,
                samples: [{ ...SAMPLED.samples[0], riskCents: 450.5 }],
            }).success,
        ).toBe(false);
        expect(
            dpAdviceSamplesSchema.safeParse({
                ...SAMPLED,
                samples: [{ ...SAMPLED.samples[0], tradeIndex: -1 }],
            }).success,
        ).toBe(false);
        expect(
            dpAdviceSamplesSchema.safeParse({
                kind: DpSamplesKind.Unavailable,
                reason: 'made-up',
                stage: DpSampleStage.Funded,
            }).success,
        ).toBe(false);
    });
});

describe('DP_ADVICE_SOLVER_VERSION', () => {
    it('is a positive integer (the solver_version column is an integer)', () => {
        expect(Number.isSafeInteger(DP_ADVICE_SOLVER_VERSION)).toBe(true);
        expect(DP_ADVICE_SOLVER_VERSION).toBeGreaterThan(0);
    });
});
