import { describe, expect, it } from 'vitest';

import { DifferenceReason } from '~/lib/prop-calculator/advisor/DifferenceReason';

const EXPECTED_MEMBERS = [
    'AggressiveOptimumChurn',
    'AssumedInputs',
    'CandidatesLeftOut',
    'CeilingCap',
    'ConsistencyCap',
    'ConsistencyNotEvaluated',
    'CushionCap',
    'DailyLossCap',
    'DocumentedLadderNeverFunded',
    'DocumentedLadderNotScored',
    'DpGridMisaligned',
    'DpGridSaturation',
    'DpIneligible',
    'DpModelGap',
    'DpNotValidated',
    'DpObjectiveMismatch',
    'DpPayoutPolicyMismatch',
    'DpStateUnreached',
    'EngineInputsRefused',
    'FirmMinimumAboveRequest',
    'FlatRiskIgnoresState',
    'FreshStartApproximation',
    'HorizonCreditOneRequest',
    'LiveModelApproximation',
    'LiveNotModeled',
    'LiveTriggersNotChecked',
    'NoCushion',
    'ObjectiveSpeedVsMonthlyNet',
    'PayoutPolicyDiffers',
    'PersonalCap',
    'PlanRulesChanged',
    'RemainingTargetCap',
    'RetainedCushionBasis',
    'StaleAdvice',
    'Suspended',
    'WholeContractPlacement',
    'WithinNoise',
    'WouldTriggerLive',
];

describe('DifferenceReason (F-124, PD-42 type declaration, PT-19 step 0)', () => {
    it('declares every reason named in PLAN.md plus the audit-driven additions, exactly once each', () => {
        expect(
            Object.keys(DifferenceReason).toSorted((a, b) =>
                a.localeCompare(b),
            ),
        ).toEqual(EXPECTED_MEMBERS.toSorted((a, b) => a.localeCompare(b)));
    });

    it('gives every member a unique, non-empty string tag', () => {
        const values = Object.values(DifferenceReason);
        expect(new Set(values).size).toBe(values.length);
        for (const value of values) expect(value.length).toBeGreaterThan(0);
    });
});
