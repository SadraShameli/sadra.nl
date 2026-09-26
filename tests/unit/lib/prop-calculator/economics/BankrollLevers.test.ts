import { describe, expect, it } from 'vitest';

import { dollars, fraction } from '~/lib/prop-calculator/core';
import {
    BankrollLeverKind,
    BankrollLeverLabel,
    type BankrollLeverOutputs,
    bankrollLevers,
    empiricalPayingStatsOf,
} from '~/lib/prop-calculator/economics';

const NET_VALUES = [900, -100, -100, -100, -100, 1400, -250, -250];

function outputsFor(overrides: Partial<BankrollLeverOutputs>): BankrollLeverOutputs {
    return {
        attemptPaysProbability: { standardError: 0.01, value: fraction(0.3) },
        costPerAttempt: dollars(100),
        expectedMonthlyNet: { standardError: 20, value: dollars(200) },
        expectedNetPerAttempt: { standardError: 5, value: dollars(50) },
        netValues: NET_VALUES,
        passProbability: { standardError: 0.02, value: fraction(0.4) },
        ...overrides,
    };
}

describe('bankrollLevers (PT-55)', () => {
    it('the base row equals a plain outputs snapshot with no label and zero deltas', () => {
        const base = outputsFor({});
        const rows = bankrollLevers(base, [], dollars(1000), 1);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.kind).toBe(BankrollLeverKind.Base);
        expect(rows[0]?.label).toBeNull();
        expect(rows[0]?.deltaPassProbability).toBe(0);
        expect(rows[0]?.deltaEvPerAttempt).toBe(0);
        expect(rows[0]?.deltaMonthlyNet).toBe(0);
        expect(rows[0]?.passProbability).toEqual(base.passProbability);
    });

    it('labels every eval-risk row and every trades-per-day row as conflicting with Hard Rule 3', () => {
        const base = outputsFor({});
        const rows = bankrollLevers(
            base,
            [
                { kind: BankrollLeverKind.Risk, outputs: outputsFor({}), value: 500 },
                {
                    kind: BankrollLeverKind.TradesPerDay,
                    outputs: outputsFor({}),
                    value: 6,
                },
            ],
            dollars(1000),
            1,
        );
        const [, riskRow, tpdRow] = rows;
        expect(riskRow?.label).toBe(BankrollLeverLabel.ConflictsWithHardRule3);
        expect(tpdRow?.label).toBe(BankrollLeverLabel.ConflictsWithHardRule3);
    });

    it('labels every request-size row as a documented request unchanged', () => {
        const base = outputsFor({});
        const rows = bankrollLevers(
            base,
            [
                {
                    kind: BankrollLeverKind.RequestSize,
                    outputs: outputsFor({}),
                    value: 2000,
                },
            ],
            dollars(1000),
            1,
        );
        expect(rows[1]?.label).toBe(BankrollLeverLabel.RequestUnchanged);
    });

    it('reports the change in P(pass), EV per attempt and monthly net relative to the base row', () => {
        const base = outputsFor({});
        const variant = outputsFor({
            expectedMonthlyNet: { standardError: 20, value: dollars(260) },
            expectedNetPerAttempt: { standardError: 5, value: dollars(65) },
            passProbability: { standardError: 0.02, value: fraction(0.5) },
        });
        const rows = bankrollLevers(
            base,
            [{ kind: BankrollLeverKind.Risk, outputs: variant, value: 500 }],
            dollars(1000),
            1,
        );
        const row = rows[1];
        expect(row?.deltaPassProbability).toBeCloseTo(0.1, 9);
        expect(row?.deltaEvPerAttempt).toBeCloseTo(15, 9);
        expect(row?.deltaMonthlyNet).toBeCloseTo(60, 9);
    });

    it('carries a loss risk at the bankroll with a standard error, over the attempts the bankroll affords', () => {
        const base = outputsFor({});
        const rows = bankrollLevers(base, [], dollars(1000), 7);
        const lossRisk = rows[0]?.lossRisk;
        expect(lossRisk?.value?.value).toBeGreaterThanOrEqual(0);
        expect(lossRisk?.value?.value).toBeLessThanOrEqual(1);
        expect(lossRisk?.value?.standardError).not.toBeNull();
    });

    it('is deterministic for the same seed', () => {
        const base = outputsFor({});
        const first = bankrollLevers(base, [], dollars(1000), 3);
        const second = bankrollLevers(base, [], dollars(1000), 3);
        expect(second).toEqual(first);
    });
});

describe('empiricalPayingStatsOf', () => {
    it('computes P(attempt pays) and mean value per paying attempt, attempt cost included', () => {
        const stats = empiricalPayingStatsOf(NET_VALUES, 100);
        expect(stats.pAttemptPays).toBeCloseTo(2 / 8, 9);
        expect(stats.valuePerPayingAttempt).toBeCloseTo((900 + 1400) / 2 + 100, 9);
    });

    it('returns zero paying probability and zero value for an empty distribution', () => {
        const stats = empiricalPayingStatsOf([], 100);
        expect(stats.pAttemptPays).toBe(0);
        expect(stats.valuePerPayingAttempt).toBe(100);
    });

    it('returns zero paying probability when nothing ever pays', () => {
        const stats = empiricalPayingStatsOf([-50, -50, -50], 100);
        expect(stats.pAttemptPays).toBe(0);
        expect(stats.valuePerPayingAttempt).toBe(100);
    });
});
