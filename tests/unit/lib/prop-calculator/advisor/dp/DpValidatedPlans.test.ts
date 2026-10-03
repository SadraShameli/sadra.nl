import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    DP_G2_RECORDED_ON,
    DP_GATE_RUNS,
    DpEvalObjective,
    DpGateFailure,
    type DpGateRun,
    dpValidationFor,
} from '~/lib/prop-calculator/advisor/dp';
import { InstrumentSymbol, PayoutRequestPolicy } from '~/lib/prop-calculator/core';
import { RateSearchStatus } from '~/lib/prop-calculator/core/AverageRewardSolver';

const LEDGER_ROOT = path.join(
    process.cwd(),
    '.claude',
    'skills',
    'prop-firm-trading',
    'references',
);

const BASIS = {
    instrument: InstrumentSymbol.MES,
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
            failure: DpGateFailure.NoGateRun,
            result: null,
            validated: false,
        });
    });

    it('validates a plan from its own run and ignores the runs of other plans', () => {
        const runs = [
            run({ planSerial: 'plan-b', solve: { ...run({}).solve, exitCode: 1 } }),
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
        const older = run({ citation: { ...run({}).citation, row: 'older' }, ranOn: '2026-10-05' });
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
            failure: DpGateFailure.BelowBestFlat,
            validated: false,
        });
    });

    it('reads every plan as not validated from the shipped table until a post-G2 gate run is recorded', () => {
        expect(DP_G2_RECORDED_ON).toBeNull();
        expect(DP_GATE_RUNS).toEqual([]);
        expect(dpValidationFor('topstep:50000:no-fee-standard')).toEqual({
            citation: null,
            failure: DpGateFailure.NoGateRun,
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
            expect(existsSync(path.join(LEDGER_ROOT, citation.file))).toBe(true);
            expect(index).toContain(citation.file);
        }
    });
});
