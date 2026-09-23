import type { ArgsDef } from 'citty';

import { parseArgs } from 'citty';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import optimizeFunded, {
    type FundedCandidateArguments,
    readFundedCandidates,
    sortDescription,
    survivorCount,
} from '~/cli/commands/prop/optimize/funded/command';
import {
    planResolver,
    readNumberList,
    singlePathGranularityArgument,
} from '~/cli/commands/prop/shared';
import {
    DayStopRuleKind,
    FirmId,
    type Plan,
    type SimInputs,
    type SimOutputs,
    simulate,
} from '~/lib/prop-calculator';

async function resolveArguments(): Promise<ArgsDef> {
    const resolvable = optimizeFunded.args;
    if (!resolvable) throw new Error('optimize funded command has no args');
    const resolved =
        typeof resolvable === 'function' ? resolvable() : resolvable;
    return resolved instanceof Promise ? resolved : resolved;
}

describe('optimize funded --path-granularity (WP11 handoff)', () => {
    it('declares the single-granularity flag explicitly', async () => {
        const arguments_ = await resolveArguments();
        expect(arguments_['path-granularity']).toStrictEqual(
            singlePathGranularityArgument['path-granularity'],
        );
    });
});

describe('optimize funded --sort default', () => {
    it('defaults sort to monthly', async () => {
        const arguments_ = await resolveArguments();
        const parsed = parseArgs([], arguments_);
        expect(parsed.sort).toBe('monthly');
    });
});

describe('optimize funded --sort options', () => {
    it('only lists monthly and cycle as valid sort keys', async () => {
        const arguments_ = await resolveArguments();
        const sortArgument = arguments_.sort;
        if (sortArgument?.type !== 'enum') {
            throw new Error('sort argument is not an enum');
        }
        expect(sortArgument.options).toStrictEqual(['monthly', 'cycle']);
    });

    it('rejects --sort lifetime', async () => {
        const arguments_ = await resolveArguments();
        expect(() => parseArgs(['--sort', 'lifetime'], arguments_)).toThrow();
    });
});

function baseSimInputs(rebuyLagDays: number): SimInputs {
    return {
        fundedHorizonDays: 252,
        maxEvalDays: 40,
        plan: registryPlan(),
        rebuyLagDays,
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 42,
        tradesPerDay: 4,
        trials: 100,
        winrate: 0.4,
    };
}

function registryPlan(): Plan {
    return planResolver.resolveOne({ firm: FirmId.Mffu, variant: 'rapid-eod' });
}

describe('optimize funded --sort monthly description', () => {
    it('states the configured rebuy lag and the horizon credit', () => {
        const description = sortDescription('monthly', baseSimInputs(3));
        expect(description).toContain('rebuy-lag-days');
        expect(description).toContain('3');
        expect(description.toLowerCase()).toContain('credit');
        expect(description.toLowerCase()).toContain('withdrawable');
    });

    it('states a rebuy lag of 0 when the input omits it', () => {
        const description = sortDescription('monthly', {
            fundedHorizonDays: 252,
            maxEvalDays: 40,
            plan: registryPlan(),
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 42,
            tradesPerDay: 4,
            trials: 100,
            winrate: 0.4,
        });
        expect(description).toContain('0 rebuy-lag-days');
    });
});

function candidateArguments(
    overrides: Partial<FundedCandidateArguments>,
): FundedCandidateArguments {
    return {
        flat: '150,200',
        percent: '5,10',
        ...overrides,
    };
}

describe('optimize funded candidate list parsing', () => {
    const stopRule = { kind: DayStopRuleKind.DayGreen } as const;

    it('rejects an empty --flat entry with the schema optimize funded uses', () => {
        expect(() =>
            readNumberList(
                '150,,200',
                'flat',
                z.number().positive(),
                'a dollar amount > 0',
            ),
        ).toThrow(/--flat/);
    });

    it('rejects a --percent entry above 100 with the schema optimize funded uses', () => {
        expect(() =>
            readNumberList(
                '5,150',
                'percent',
                z.number().positive().max(100),
                'a percent in (0, 100]',
            ),
        ).toThrow(/--percent/);
    });

    it('rejects an empty --flat entry instead of skipping it', () => {
        expect(() =>
            readFundedCandidates(
                candidateArguments({ flat: '150,,200' }),
                stopRule,
            ),
        ).toThrow(/--flat "150,,200": entry 2 is empty/);
    });

    it.each(['5,150', '0,5', '5,,10'])('rejects --percent %s', (percent) => {
        expect(() =>
            readFundedCandidates(candidateArguments({ percent }), stopRule),
        ).toThrow(/--percent/);
    });

    it('names --funded-ladder when its ladder is malformed', () => {
        expect(() =>
            readFundedCandidates(
                candidateArguments({ 'funded-ladder': '400,,600' }),
                stopRule,
            ),
        ).toThrow(/--funded-ladder "400,,600": entry 2 is empty/);
    });

    it.each(['', ' '.repeat(3)])(
        'skips the flat family when --flat is %j',
        (flat) => {
            const candidates = readFundedCandidates(
                candidateArguments({ flat }),
                stopRule,
            );
            expect(
                candidates.map((candidate) => candidate.label),
            ).toStrictEqual(['5% cushion', '10% cushion']);
        },
    );

    it.each(['', ' '.repeat(3)])(
        'skips the percent family when --percent is %j',
        (percent) => {
            const candidates = readFundedCandidates(
                candidateArguments({ percent }),
                stopRule,
            );
            expect(
                candidates.map((candidate) => candidate.label),
            ).toStrictEqual(['flat $150', 'flat $200']);
        },
    );

    it('runs a ladder-only sweep when --flat and --percent are both empty', () => {
        const candidates = readFundedCandidates(
            candidateArguments({
                flat: '',
                'funded-ladder': '400,600',
                percent: '',
            }),
            stopRule,
        );
        expect(candidates.map((candidate) => candidate.label)).toStrictEqual([
            'ladder 400/600',
        ]);
    });

    it('rejects a sweep with no candidates at all', () => {
        expect(() =>
            readFundedCandidates(
                candidateArguments({ flat: '', percent: '' }),
                stopRule,
            ),
        ).toThrow(/--flat, --percent or --funded-ladder/);
    });

    it('builds flat, percent and ladder candidates in order', () => {
        const candidates = readFundedCandidates(
            candidateArguments({ 'funded-ladder': '400,600' }),
            stopRule,
        );
        expect(candidates.map((candidate) => candidate.label)).toStrictEqual([
            'flat $150',
            'flat $200',
            '5% cushion',
            '10% cushion',
            'ladder 400/600',
        ]);
        expect(candidates[2]?.overrides.fundedCushionPercent).toBe(0.05);
        expect(candidates[4]?.overrides.fundedDayPolicy).toStrictEqual({
            ladder: [400, 600],
            maxLossesPerDay: null,
            stopRule,
        });
    });
});

describe('optimize funded survivors (D2)', () => {
    const base = simulate({
        fundedHorizonDays: 20,
        maxEvalDays: 30,
        plan: registryPlan(),
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 1,
        tradesPerDay: 4,
        trials: 20,
        winrate: 0.5,
    });

    it('counts survivors from fundedSurvivalProbability', () => {
        const out: SimOutputs = {
            ...base,
            evalPassProbability: 0.9,
            fundedSurvivalProbability: 0.25,
        };
        expect(survivorCount(out, 400)).toBe(100);
    });

    it('never counts eval passes that later busted funded', () => {
        const out: SimOutputs = {
            ...base,
            evalPassProbability: 0.8,
            fundedSurvivalProbability: 0,
        };
        expect(survivorCount(out, 400)).toBe(0);
    });
});
