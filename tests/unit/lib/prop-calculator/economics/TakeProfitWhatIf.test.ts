import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    DriftEdge,
    FirmId,
    FixedWinRateEdge,
    fraction,
    MffuVariant,
    type SimInputs,
    simulate,
} from '~/lib/prop-calculator';
import {
    TAKE_PROFIT_WHAT_IF_LABEL,
    takeProfitCandidateInputs,
    takeProfitRows,
} from '~/lib/prop-calculator/economics';
import { findFirm } from '~/lib/prop-calculator/firms';

const ADVISOR_ROOT = path.join(
    process.cwd(),
    'src',
    'lib',
    'prop-calculator',
    'advisor',
);

function advisorSourceFiles(): string[] {
    return readdirSync(ADVISOR_ROOT, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
        .map((entry) => path.join(entry.parentPath, entry.name));
}

function baseSimInputs(overrides: Partial<SimInputs> = {}): SimInputs {
    return {
        fundedHorizonDays: 252,
        maxEvalDays: 40,
        plan: rapidEodPlan(),
        rebuyLagDays: 0,
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 42,
        tradesPerDay: 4,
        trials: 100,
        winrate: 0.4,
        ...overrides,
    };
}

function rapidEodPlan() {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

describe('takeProfitCandidateInputs', () => {
    it('builds one SimInputs per rr with rrRatio and fundedRrRatio both set to that rr', () => {
        const base = baseSimInputs();
        const edge = new FixedWinRateEdge(fraction(0.4));
        const inputs = takeProfitCandidateInputs(base, edge, [1, 1.5, 2, 3]);
        expect(inputs.map((i) => i.rrRatio)).toStrictEqual([1, 1.5, 2, 3]);
        expect(inputs.map((i) => i.fundedRrRatio)).toStrictEqual([
            1, 1.5, 2, 3,
        ]);
    });

    it('derives the win rate from the edge model per rr (a fixed model repeats one rate)', () => {
        const base = baseSimInputs();
        const edge = new FixedWinRateEdge(fraction(0.4));
        const inputs = takeProfitCandidateInputs(base, edge, [1, 2, 3]);
        expect(inputs.map((i) => i.winrate)).toStrictEqual([0.4, 0.4, 0.4]);
    });

    it('derives a different win rate per rr from a drift model (V-16, V-69, V-75)', () => {
        const base = baseSimInputs();
        const edge = DriftEdge.fittedTo(0.4, 2);
        const inputs = takeProfitCandidateInputs(base, edge, [1, 2, 3]);
        expect(inputs[0]?.winrate).toBeCloseTo(0.5486, 4);
        expect(inputs[1]?.winrate).toBeCloseTo(0.4, 6);
        expect(inputs[2]?.winrate).toBeCloseTo(0.3271, 4);
    });

    it('leaves every other base field untouched', () => {
        const base = baseSimInputs({
            commissionPerRoundTrip: 4.5,
            copyAccounts: 3,
        });
        const edge = new FixedWinRateEdge(fraction(0.4));
        const [input] = takeProfitCandidateInputs(base, edge, [2]);
        expect(input?.commissionPerRoundTrip).toBe(4.5);
        expect(input?.copyAccounts).toBe(3);
        expect(input?.plan).toBe(base.plan);
        expect(input?.seed).toBe(base.seed);
    });

    it('the row at the anchor rr equals a plain simulate of the base inputs (PT-64a acceptance)', () => {
        const base = baseSimInputs({ rrRatio: 2, winrate: 0.4 });
        const edge = DriftEdge.fittedTo(0.4, 2);
        const [anchorInputs] = takeProfitCandidateInputs(base, edge, [2]);
        if (!anchorInputs) throw new Error('expected one candidate input');
        expect(simulate(anchorInputs)).toStrictEqual(simulate(base));
    });
});

describe('takeProfitRows', () => {
    it('pairs each candidate input with its output and carries the derived win rate, rr and the what-if label', () => {
        const base = baseSimInputs();
        const edge = new FixedWinRateEdge(fraction(0.4));
        const candidateInputs = takeProfitCandidateInputs(base, edge, [1, 2]);
        const outputs = candidateInputs.map((inputs) => simulate(inputs));
        const rows = takeProfitRows(candidateInputs, outputs);
        expect(rows).toHaveLength(2);
        expect(rows.map((row) => row.rrRatio)).toStrictEqual([1, 2]);
        expect(
            rows.every((row) => row.label === TAKE_PROFIT_WHAT_IF_LABEL),
        ).toBe(true);
        expect(rows[0]?.out).toBe(outputs[0]);
        expect(rows.map((row) => row.winrate)).toStrictEqual([0.4, 0.4]);
    });

    it('carries pass rate, days to pass and both net figures via the raw SimOutputs (PT-64a step 2)', () => {
        const base = baseSimInputs();
        const edge = new FixedWinRateEdge(fraction(0.4));
        const candidateInputs = takeProfitCandidateInputs(base, edge, [2]);
        const outputs = candidateInputs.map((inputs) => simulate(inputs));
        const [row] = takeProfitRows(candidateInputs, outputs);
        expect(row?.out.attemptPassProbability).toBeGreaterThanOrEqual(0);
        expect(row?.out.daysToPassP50).toBeGreaterThanOrEqual(0);
        expect(typeof row?.out.expectedMonthlyNet).toBe('number');
        expect(typeof row?.out.expectedNet).toBe('number');
    });

    it('throws when outputs and candidate inputs are not the same length', () => {
        const base = baseSimInputs();
        const edge = new FixedWinRateEdge(fraction(0.4));
        const candidateInputs = takeProfitCandidateInputs(base, edge, [1, 2]);
        const [firstCandidateInput] = candidateInputs;
        if (!firstCandidateInput) throw new Error('expected a candidate input');
        const outputs = [simulate(firstCandidateInput)];
        expect(() => takeProfitRows(candidateInputs, outputs)).toThrow();
    });
});

describe('the take-profit what-if is never reached from the advisor (never used by the headline, the rulebook or advice)', () => {
    it('no advisor source file names DriftEdge or TakeProfitWhatIf', () => {
        const offenders = advisorSourceFiles().filter((file) => {
            const content = readFileSync(file, 'utf8');
            return (
                content.includes('DriftEdge') ||
                content.includes('TakeProfitWhatIf')
            );
        });
        expect(offenders).toStrictEqual([]);
    });
});
