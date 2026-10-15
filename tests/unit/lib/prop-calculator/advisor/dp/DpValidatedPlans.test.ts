import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { DpGateFailureCode } from '~/lib/prop-calculator/advisor';
import {
    DP_G2_RECORDED_ON,
    DP_GATE_RUNS,
    DpEvalObjective,
    type DpGateRun,
    dpValidationFor,
} from '~/lib/prop-calculator/advisor/dp';
import {
    InstrumentSymbol,
    PayoutRequestPolicy,
    serializePlanId,
} from '~/lib/prop-calculator/core';
import { RateSearchStatus } from '~/lib/prop-calculator/core/AverageRewardSolver';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';

const LEDGER_ROOT = path.join(
    process.cwd(),
    '.claude',
    'skills',
    'prop-firm-trading',
    'references',
);

const BASIS = {
    instrument: InstrumentSymbol.MNQ,
    payoutRequestPolicy: PayoutRequestPolicy.FullRequestOnly,
    payoutRequestSize: 500,
    retainedCushion: 2000,
    stopPoints: 10,
} as const;

function run(overrides: Partial<DpGateRun>): DpGateRun {
    return {
        citation: {
            date: '2026-10-05',
            file: 'engine-results/2026-10-05-dp-gate.md',
            row: 'row',
        },
        dp: { creditFree: 3300, creditInclusive: 3400 },
        dpBasis: BASIS,
        engineRef: 'be4620b3',
        evalObjective: DpEvalObjective.CashAtPass,
        flat: { creditFree: 3200, creditInclusive: 3300 },
        flatBasis: BASIS,
        planSerial: 'plan-a',
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

describe('dpValidationFor', () => {
    it('reads not validated with no gate run for a plan the table does not hold', () => {
        expect(
            dpValidationFor('plan-a', { g2RecordedOn: '2026-10-01', runs: [] }),
        ).toEqual({
            citation: null,
            failure: DpGateFailureCode.NoGateRun,
            result: null,
            validated: false,
        });
    });

    it('validates a plan from its own run and ignores the runs of other plans', () => {
        const runs = [
            run({
                planSerial: 'plan-b',
                solve: { ...run({}).solve, exitCode: 1 },
            }),
            run({ planSerial: 'plan-a' }),
        ];

        expect(
            dpValidationFor('plan-a', { g2RecordedOn: '2026-10-01', runs })
                .validated,
        ).toBe(true);
        expect(
            dpValidationFor('plan-b', { g2RecordedOn: '2026-10-01', runs })
                .validated,
        ).toBe(false);
    });

    it('judges a plan by its latest run, not by an older passing one', () => {
        const older = run({
            citation: { ...run({}).citation, row: 'older' },
            ranOn: '2026-10-05',
        });
        const newer = run({
            citation: { ...run({}).citation, row: 'newer' },
            dp: { creditFree: 3000, creditInclusive: 3100 },
            ranOn: '2026-10-09',
        });

        const verdict = dpValidationFor('plan-a', {
            g2RecordedOn: '2026-10-01',
            runs: [newer, older],
        });

        expect(verdict).toMatchObject({
            citation: { row: 'newer' },
            failure: DpGateFailureCode.BelowBestFlat,
            validated: false,
        });
    });

    it('ships the 2026-10-15 gate re-run: one post-G2 run per registry plan, each plan judged by its own row (PT-30a2)', () => {
        const registrySerials = new Set(
            ALL_FIRMS.flatMap((firm) => firm.plans).map((plan) =>
                serializePlanId(plan.id),
            ),
        );
        const serials = DP_GATE_RUNS.map((gateRun) => gateRun.planSerial);

        expect(DP_G2_RECORDED_ON).toBe('2026-10-15');
        expect(DP_GATE_RUNS.length).toBeGreaterThan(0);
        expect(new Set(serials).size).toBe(serials.length);
        for (const gateRun of DP_GATE_RUNS) {
            expect(registrySerials.has(gateRun.planSerial)).toBe(true);
            expect(gateRun.ranOn > '2026-10-15').toBe(true);
            expect(dpValidationFor(gateRun.planSerial).citation).toEqual(
                gateRun.citation,
            );
        }
        expect(dpValidationFor('plan-not-in-the-table')).toEqual({
            citation: null,
            failure: DpGateFailureCode.NoGateRun,
            result: null,
            validated: false,
        });
    });

    it('cites only ledger files that exist and are listed in the ledger index', () => {
        const index = readFileSync(
            path.join(LEDGER_ROOT, 'engine-results.md'),
            'utf8',
        );

        for (const { citation } of DP_GATE_RUNS) {
            expect(existsSync(path.join(LEDGER_ROOT, citation.file))).toBe(
                true,
            );
            expect(index).toContain(citation.file);
        }
    });
});
