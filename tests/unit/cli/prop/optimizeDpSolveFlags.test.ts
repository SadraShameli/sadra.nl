import { parseArgs } from 'citty';
import { describe, expect, it } from 'vitest';

import {
    dpArguments,
    dpObjectiveSolverConfig,
    dpSolverConfig,
    readDpInputs,
    renewalObjective,
} from '~/cli/commands/prop/optimize/dp/command';
import { SizingObjective } from '~/lib/prop-calculator/advisor';
import { FirmId, TopStepVariant } from '~/lib/prop-calculator/core';
import { TopStep } from '~/lib/prop-calculator/firms/topstep/TopStep';

function parseDpInputs(argv: string[]) {
    return readDpInputs(parseArgs<typeof dpArguments>(argv, dpArguments));
}

function topStepObjectiveFor(argv: string[]) {
    const plan = new TopStep().findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.NoFeeStandard,
    });
    if (!plan) throw new Error('TopStep no-fee-standard 50K plan not found');
    const inputs = parseDpInputs(argv);
    return { inputs, objective: renewalObjective(inputs, plan) };
}

describe('optimize dp --workers and --start-rate (WP66a R4 and R5)', () => {
    it('leaves both unset by default, so the solve uses every core and starts the rate search at 0', () => {
        const inputs = parseDpInputs([]);

        expect(inputs.maxWorkers).toBeUndefined();
        expect(inputs.startRatePerDay).toBeUndefined();
    });

    it('reads --workers as a whole number of at least 1', () => {
        expect(parseDpInputs(['--workers', '10']).maxWorkers).toBe(10);
    });

    it.each(['0', '1.5', '-2', 'many'])('rejects --workers %s', (value) => {
        expect(() => parseDpInputs(['--workers', value])).toThrow(
            /--workers must be a whole number >= 1/,
        );
    });

    it('reads --start-rate as a rate per day', () => {
        expect(parseDpInputs(['--start-rate', '216.6']).startRatePerDay).toBe(
            216.6,
        );
    });

    it.each(['-1', 'high'])('rejects --start-rate %s', (value) => {
        expect(() => parseDpInputs(['--start-rate', value])).toThrow(
            /--start-rate must be a number >= 0/,
        );
    });

    it('declares both flags with help text that says what they do', () => {
        expect(dpArguments.workers.type).toBe('string');
        expect(dpArguments.workers.description).toContain('worker threads');
        expect(dpArguments['start-rate'].type).toBe('string');
        expect(dpArguments['start-rate'].description).toContain('rate search');
        expect(dpArguments['start-rate'].description).not.toContain('\u{2014}');
        expect(dpArguments.workers.description).not.toContain('\u{2014}');
    });

    it('hands the cap and the seed to the solver config', () => {
        const { inputs, objective } = topStepObjectiveFor([
            '--workers',
            '6',
            '--start-rate',
            '240',
        ]);

        const config = dpSolverConfig(inputs, objective);

        expect(config.maxWorkers).toBe(6);
        expect(config.startRatePerDay).toBe(240);
    });

    it('leaves the cap and the seed out of the solver config without the flags', () => {
        const { inputs, objective } = topStepObjectiveFor([]);

        const config = dpSolverConfig(inputs, objective);

        expect(config.maxWorkers).toBeUndefined();
        expect(config.startRatePerDay).toBeUndefined();
    });

    it('keeps the cap through the cycle objective, which still solves only at rate 0', () => {
        const { inputs, objective } = topStepObjectiveFor([
            '--workers',
            '6',
            '--start-rate',
            '240',
        ]);

        const cycle = dpObjectiveSolverConfig(
            dpSolverConfig(inputs, objective),
            SizingObjective.CycleCash,
        );

        expect(cycle.maxWorkers).toBe(6);
        expect(cycle.maxSolves).toBe(1);
        expect(cycle.startRatePerDay).toBe(0);
    });
});
