import { describe, expect, it } from 'vitest';

import {
    adviceProvenance,
    AdviceSource,
    SizingObjective,
    SpeedObjective,
    StartBasis,
} from '~/lib/prop-calculator/advisor';

describe('adviceProvenance (PT-19f, F-126)', () => {
    it('carries source, objective, start basis, snapshot date and the plan-rule fingerprint', () => {
        const provenance = adviceProvenance({
            computedAt: '2026-09-27T00:00:00.000Z',
            firmDataDate: '2026-08-19',
            objective: SizingObjective.MonthlyNet,
            planRulesFingerprint: 'abc123',
            snapshotDate: '2026-09-26',
            source: AdviceSource.Documented,
            startBasis: StartBasis.FromState,
        });

        expect(provenance).toEqual({
            computedAt: '2026-09-27T00:00:00.000Z',
            firmDataDate: '2026-08-19',
            objective: SizingObjective.MonthlyNet,
            planRulesFingerprint: 'abc123',
            seed: null,
            snapshotDate: '2026-09-26',
            solverVersion: null,
            source: AdviceSource.Documented,
            startBasis: StartBasis.FromState,
            trials: null,
        });
    });

    it('carries an engine source with its trials and seed', () => {
        const provenance = adviceProvenance({
            computedAt: '2026-09-27T00:00:00.000Z',
            firmDataDate: null,
            objective: SizingObjective.MonthlyNet,
            planRulesFingerprint: null,
            seed: 42,
            snapshotDate: '2026-09-26',
            source: AdviceSource.FundedSweepFresh,
            startBasis: StartBasis.Fresh,
            trials: 4000,
        });

        expect(provenance.trials).toBe(4000);
        expect(provenance.seed).toBe(42);
    });

    it('carries the speed objective of a ladder-sourced advice', () => {
        const provenance = adviceProvenance({
            computedAt: '2026-09-27T00:00:00.000Z',
            firmDataDate: null,
            objective: SpeedObjective.SpeedToFunded,
            planRulesFingerprint: null,
            snapshotDate: '2026-09-26',
            source: AdviceSource.LadderSearchFresh,
            startBasis: StartBasis.Fresh,
        });

        expect(provenance.objective).toBe(SpeedObjective.SpeedToFunded);
    });
});
