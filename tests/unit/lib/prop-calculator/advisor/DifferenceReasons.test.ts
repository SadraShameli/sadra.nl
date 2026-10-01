import { describe, expect, it } from 'vitest';

import { dollars } from '~/lib/prop-calculator';
import {
    DAY_STOP_REASON_TEXT,
    DayStopReason,
    DEFAULT_RULEBOOK,
    DifferenceReason,
    type DifferenceReasonDetail,
    differenceReasonHeadline,
    differenceReasonText,
    DpNotValidatedCause,
    RuleSource,
    SIZING_ASSUMPTION_TEXT,
    SIZING_CONSTRAINT_TEXT,
    SizingAssumption,
    SizingConstraint,
} from '~/lib/prop-calculator/advisor';

function digitsOf(text: string): string {
    return (text.match(/\d/g) ?? []).join('');
}

describe('differenceReasonHeadline (F-124, PD-32)', () => {
    it('names the documented rule when the rulebook matches every default', () => {
        expect(differenceReasonHeadline(DEFAULT_RULEBOOK)).toBe(
            'your documented rule',
        );
    });

    it('names the custom rule via documentedRuleLabel(rulebookDeviation(...))', () => {
        const custom = {
            ...DEFAULT_RULEBOOK,
            funded: { ...DEFAULT_RULEBOOK.funded, riskCents: 30_000 },
        };
        expect(differenceReasonHeadline(custom)).toBe(
            `your custom rule (differs from ${RuleSource.HardRule5})`,
        );
    });
});

describe('differenceReasonText (F-124, PD-32 sentinel test)', () => {
    it('builds text only from the typed fields: the sentinel numbers appear and no others', () => {
        const text = differenceReasonText({
            gap: dollars(1234.56),
            kind: DifferenceReason.WithinNoise,
            threshold: dollars(7.25),
        });
        expect(digitsOf(text)).toBe('123456725');
    });

    it('builds the CeilingCap text only from the typed ceiling field (PT-36b F-154)', () => {
        const text = differenceReasonText({
            ceiling: dollars(9950.5),
            kind: DifferenceReason.CeilingCap,
        });
        expect(digitsOf(text)).toBe('995050');
    });

    it('pins the WouldTriggerLive text on today\'s string-only trigger field (PT-36b: not typed numeric fields; PayoutRequestRule/PayoutReadiness carry the numbers separately)', () => {
        const text = differenceReasonText({
            kind: DifferenceReason.WouldTriggerLive,
            trigger: '2 of 3 payouts taken',
        });
        expect(text).toBe(
            'This would trigger a live-account transition: 2 of 3 payouts taken',
        );
    });

    it('reports the DpNotValidated cause including SolveCapReached', () => {
        const text = differenceReasonText({
            cause: DpNotValidatedCause.SolveCapReached,
            kind: DifferenceReason.DpNotValidated,
        });
        expect(text.length).toBeGreaterThan(0);
    });

    it('gives every DifferenceReason member a non-empty text', () => {
        const bareDetails: Record<string, DifferenceReasonDetail> = {
            AssumedInputs: { kind: DifferenceReason.AssumedInputs },
            ConsistencyNotEvaluated: {
                kind: DifferenceReason.ConsistencyNotEvaluated,
            },
            DpGridSaturation: { kind: DifferenceReason.DpGridSaturation },
            DpObjectiveMismatch: {
                kind: DifferenceReason.DpObjectiveMismatch,
            },
            DpPayoutPolicyMismatch: {
                kind: DifferenceReason.DpPayoutPolicyMismatch,
            },
            FreshStartApproximation: {
                kind: DifferenceReason.FreshStartApproximation,
            },
            LiveModelApproximation: {
                kind: DifferenceReason.LiveModelApproximation,
            },
            LiveNotModeled: { kind: DifferenceReason.LiveNotModeled },
            LiveTriggersNotChecked: {
                kind: DifferenceReason.LiveTriggersNotChecked,
            },
            NoCushion: { kind: DifferenceReason.NoCushion },
            ObjectiveSpeedVsMonthlyNet: {
                kind: DifferenceReason.ObjectiveSpeedVsMonthlyNet,
            },
            PlanRulesChanged: { kind: DifferenceReason.PlanRulesChanged },
        };
        for (const detail of Object.values(bareDetails)) {
            expect(differenceReasonText(detail).length).toBeGreaterThan(0);
        }
    });
});

function alphabetically(a: string, b: string): number {
    return a.localeCompare(b);
}

describe('exhaustive text maps (PT-19 step 8)', () => {
    it('covers every SizingConstraint member with non-empty text', () => {
        expect(Object.keys(SIZING_CONSTRAINT_TEXT).toSorted(alphabetically)).toEqual(
            Object.values(SizingConstraint).toSorted(alphabetically),
        );
        for (const text of Object.values(SIZING_CONSTRAINT_TEXT)) {
            expect(text.length).toBeGreaterThan(0);
        }
    });

    it('covers every DayStopReason member with non-empty text', () => {
        expect(Object.keys(DAY_STOP_REASON_TEXT).toSorted(alphabetically)).toEqual(
            Object.values(DayStopReason).toSorted(alphabetically),
        );
        for (const text of Object.values(DAY_STOP_REASON_TEXT)) {
            expect(text.length).toBeGreaterThan(0);
        }
    });

    it('covers every SizingAssumption member with non-empty text', () => {
        expect(
            Object.keys(SIZING_ASSUMPTION_TEXT).toSorted(alphabetically),
        ).toEqual(Object.values(SizingAssumption).toSorted(alphabetically));
        for (const text of Object.values(SIZING_ASSUMPTION_TEXT)) {
            expect(text.length).toBeGreaterThan(0);
        }
    });
});
