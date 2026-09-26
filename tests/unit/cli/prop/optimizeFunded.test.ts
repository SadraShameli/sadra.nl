import type { ArgsDef } from 'citty';

import { parseArgs } from 'citty';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import optimizeFunded, {
    type FundedCandidateArguments,
    fundedRowCells,
    FundedSortKey,
    fundedSweepProgress,
    fundedSweepSummary,
    readFundedCandidates,
    sortDescription,
    survivorCount,
} from '~/cli/commands/prop/optimize/funded/command';
import {
    planResolver,
    readNumberList,
    singlePathGranularityArgument,
} from '~/cli/commands/prop/shared';
import { formatCurrency, formatPercent } from '~/lib/format';
import {
    DayStopRuleKind,
    FirmId,
    fraction,
    InstrumentSymbol,
    type Plan,
    PolicySizing,
    resolvePositionSizing,
    type SimInputs,
    type SimOutputs,
    simulate,
    TRADING_DAYS_PER_MONTH,
} from '~/lib/prop-calculator';
import { simInputsSizingIssue } from '~/lib/prop-calculator/simulator';

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

describe('optimize funded spinner text (WP23: a plan label is never joined with another middle dot)', () => {
    it('separates the plan label from the sweep size with a colon while the sweep runs', () => {
        expect(fundedSweepProgress('$50K · Zero', 12, 500)).toBe(
            '$50K · Zero: 12 funded policies, 500 trials each',
        );
    });

    it('separates the plan label from the policy count with a colon when the sweep ends', () => {
        expect(fundedSweepSummary('$50K · Zero', 12)).toBe(
            '$50K · Zero: 12 funded policies',
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

    it('draws its options from the FundedSortKey enum (WP21b)', async () => {
        const arguments_ = await resolveArguments();
        const sortArgument = arguments_.sort;
        if (sortArgument?.type !== 'enum') {
            throw new Error('sort argument is not an enum');
        }
        expect(sortArgument.default).toBe(FundedSortKey.Monthly);
        expect(sortArgument.options).toStrictEqual([
            FundedSortKey.Monthly,
            FundedSortKey.Cycle,
        ]);
    });

    it('rejects --sort lifetime', async () => {
        const arguments_ = await resolveArguments();
        expect(() => parseArgs(['--sort', 'lifetime'], arguments_)).toThrow();
    });

    it('defines monthly in --help with the horizon credit, like the printed ranking note (N-72)', async () => {
        const arguments_ = await resolveArguments();
        const description = arguments_.sort?.description ?? '';
        expect(description).toContain(
            '(per-run net + horizon credit) divided by expected days per run',
        );
        expect(description).toContain(
            "the 'monthly ex-credit' column leaves the credit out",
        );
        expect(description).not.toContain('per-run net divided by');
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
    it('states that monthly net adds the horizon credit to the per-cycle net and that monthly ex-credit leaves it out (N-72)', () => {
        const description = sortDescription(
            FundedSortKey.Monthly,
            baseSimInputs(0),
        );
        expect(description).toContain(
            `monthly net = (per-cycle net + horizon credit) x ${TRADING_DAYS_PER_MONTH} / slot days`,
        );
        expect(description).toContain(
            `monthly ex-credit = per-cycle net x ${TRADING_DAYS_PER_MONTH} / slot days, leaving the horizon credit out`,
        );
    });

    it('states the configured rebuy lag and the horizon credit', () => {
        const description = sortDescription(
            FundedSortKey.Monthly,
            baseSimInputs(3),
        );
        expect(description).toContain('rebuy-lag-days');
        expect(description).toContain('3');
        expect(description.toLowerCase()).toContain('credit');
        expect(description.toLowerCase()).toContain('withdrawable');
    });

    it('names the payout profit pool and the lifetime payout cutoff among the horizon credit caps (N-72)', () => {
        const description = sortDescription(
            FundedSortKey.Monthly,
            baseSimInputs(0),
        );
        expect(description).toContain(
            'capped by the payout profit pool (cycle profit since the last payout on cycle-pool plans) when there is no payout ladder',
        );
        expect(description).toContain(
            '0 once a lifetime payout cap is reached or the payout ladder is exhausted',
        );
    });

    it('states a rebuy lag of 0 when the input omits it', () => {
        const description = sortDescription(FundedSortKey.Monthly, {
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

const mnqAtTen = resolvePositionSizing(InstrumentSymbol.MNQ, 10);

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
                mnqAtTen,
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
            mnqAtTen,
        );
        expect(candidates.map((candidate) => candidate.label)).toStrictEqual([
            'flat $150 (7 MNQ = $140)',
            'flat $200 (10 MNQ = $200)',
            '5% cushion',
            '10% cushion',
            'ladder 400/600 (20/30 MNQ = $400/$600)',
        ]);
        expect(candidates[2]?.overrides.fundedCushionPercent).toBe(0.05);
        expect(candidates[4]?.overrides.fundedDayPolicy).toStrictEqual({
            ladder: [400, 600],
            maxLossesPerDay: null,
            sizing: PolicySizing.WholeContracts,
            stopRule,
        });
    });

    it('builds a contract-capped ladder candidate with its plain label when no stop is given', () => {
        const candidates = readFundedCandidates(
            candidateArguments({ 'funded-ladder': '400,600', percent: '' }),
            stopRule,
            null,
        );
        expect(candidates.map((candidate) => candidate.label)).toStrictEqual([
            'flat $150',
            'flat $200',
            'ladder 400/600',
        ]);
        expect(candidates[2]?.overrides.fundedDayPolicy).toStrictEqual({
            ladder: [400, 600],
            maxLossesPerDay: null,
            sizing: PolicySizing.ContractCapped,
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

async function capturedRun(argv: string[]): Promise<{
    exitCode: number | string | undefined;
    stderr: string;
    stdout: string;
}> {
    const arguments_ = await resolveArguments();
    const written: string[] = [];
    const writtenError: string[] = [];
    const write = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation((chunk: string | Uint8Array) => {
            written.push(String(chunk));
            return true;
        });
    const writeError = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation((chunk: string | Uint8Array) => {
            writtenError.push(String(chunk));
            return true;
        });
    const exitCode = process.exitCode;
    process.exitCode = undefined;
    let runExitCode: number | string | undefined;
    try {
        await optimizeFunded.run?.({
            args: parseArgs(argv, arguments_) as never,
            cmd: optimizeFunded,
            rawArgs: argv,
        });
        runExitCode = process.exitCode;
    } finally {
        write.mockRestore();
        writeError.mockRestore();
        process.exitCode = exitCode;
    }
    return {
        exitCode: runExitCode,
        stderr: writtenError.join(''),
        stdout: written.join(''),
    };
}

const SMALL_RUN = [
    '--firm',
    'mffu',
    '--variant',
    'rapid-eod',
    '--trials',
    '5',
    '--eval-days',
    '5',
    '--funded-days',
    '5',
];

describe('optimize funded --percent needs --stop-points (T33, N-71)', () => {
    const stopRule = { kind: DayStopRuleKind.DayGreen } as const;

    it('rejects an explicit --percent without --stop-points, naming both flags', () => {
        expect(() =>
            readFundedCandidates({ flat: '150', percent: '10' }, stopRule),
        ).toThrow(/--percent[\s\S]*--stop-points/);
    });

    it('accepts --percent once --stop-points is given', () => {
        const candidates = readFundedCandidates(
            { flat: '', percent: '10' },
            stopRule,
            mnqAtTen,
        );
        expect(candidates.map((candidate) => candidate.label)).toStrictEqual([
            '10% cushion',
        ]);
    });

    it('leaves the default percent candidates out without --stop-points and keeps the flat ones', () => {
        const candidates = readFundedCandidates({ flat: '150,200' }, stopRule);
        expect(candidates.map((candidate) => candidate.label)).toStrictEqual([
            'flat $150',
            'flat $200',
        ]);
    });

    it('sweeps the default percent candidates when --stop-points is given', () => {
        const candidates = readFundedCandidates(
            { flat: '' },
            stopRule,
            mnqAtTen,
        );
        expect(candidates.map((candidate) => candidate.label)).toStrictEqual([
            '5% cushion',
            '7.5% cushion',
            '10% cushion',
            '15% cushion',
        ]);
    });

    it('exits with an error naming both flags when run with --percent 10 and no --stop-points', async () => {
        const result = await capturedRun([...SMALL_RUN, '--percent', '10']);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toMatch(/--percent/);
        expect(result.stderr).toMatch(/--stop-points/);
    });

    it('runs --percent 10 with --stop-points 10 (instrument defaults to NQ)', async () => {
        const result = await capturedRun([
            ...SMALL_RUN,
            '--percent',
            '10',
            '--flat',
            '',
            '--stop-points',
            '10',
        ]);
        expect(result.exitCode).toBeUndefined();
        expect(result.stdout).toContain('10% cushion');
    });

    it('runs the default sweep without --stop-points, printing why the percent rows are left out', async () => {
        const result = await capturedRun([...SMALL_RUN, '--flat', '200']);
        expect(result.exitCode).toBeUndefined();
        expect(result.stdout).toContain('flat $200');
        expect(result.stdout).not.toContain('% cushion');
        expect(result.stdout).toMatch(/--stop-points/);
    });
});

describe('optimize funded flat rows at a stop are placed in whole contracts (T33, U18)', () => {
    const stopRule = { kind: DayStopRuleKind.DayGreen } as const;
    const nqAtTen = resolvePositionSizing(InstrumentSymbol.NQ, 10);

    it('labels each flat row with the whole contracts it places and leaves out a row below one contract', () => {
        const candidates = readFundedCandidates(
            { flat: '150,250,500', percent: '' },
            stopRule,
            nqAtTen,
        );
        expect(candidates.map((candidate) => candidate.label)).toStrictEqual([
            'flat $250 (1 NQ = $200)',
            'flat $500 (2 NQ = $400)',
        ]);
    });

    it('keeps the plain dollar label when no stop is given', () => {
        const candidates = readFundedCandidates(
            { flat: '150', percent: '' },
            stopRule,
            null,
        );
        expect(candidates.map((candidate) => candidate.label)).toStrictEqual([
            'flat $150',
        ]);
    });

    it('fails loud, naming the one-contract risk, when every candidate is below one contract', () => {
        expect(() =>
            readFundedCandidates(
                { flat: '150', percent: '' },
                stopRule,
                nqAtTen,
            ),
        ).toThrow(/\$150[\s\S]*one NQ contract[\s\S]*\$200/);
    });

    it('prints why a flat row below one contract is left out and never trades a bigger risk under its label', async () => {
        const result = await capturedRun([
            ...SMALL_RUN,
            '--flat',
            '150,250',
            '--percent',
            '',
            '--stop-points',
            '10',
        ]);
        expect(result.exitCode).toBeUndefined();
        expect(result.stdout).toContain('flat $250 (1 NQ = $200)');
        expect(result.stdout).not.toMatch(/flat \$150(?! left out)/);
        expect(result.stdout).toMatch(
            /\$150 left out[\s\S]*one NQ contract[\s\S]*\$200/,
        );
    });

    it('notes that the --funded-ladder row is placed in whole contracts like the flat and percent rows (WP40)', async () => {
        const result = await capturedRun([
            ...SMALL_RUN,
            '--flat',
            '250',
            '--percent',
            '',
            '--funded-ladder',
            '400,600',
            '--stop-points',
            '10',
        ]);
        expect(result.exitCode).toBeUndefined();
        expect(result.stdout).toContain('ladder 400/600 (2/3 NQ = $400/$600)');
        expect(result.stdout).toMatch(
            /flat, percent and ladder rows are placed in whole NQ contracts/,
        );
        expect(result.stdout).not.toMatch(/not rounded to whole contracts/);
    });

    it('prints no ladder note without --stop-points', async () => {
        const result = await capturedRun([
            ...SMALL_RUN,
            '--flat',
            '250',
            '--funded-ladder',
            '400,600',
        ]);
        expect(result.exitCode).toBeUndefined();
        expect(result.stdout).not.toMatch(/not rounded to whole contracts/);
    });
});

describe('optimize funded --funded-ladder ranks on the same whole-contract footing as flat rows (WP40, T33)', () => {
    const stopRule = { kind: DayStopRuleKind.DayGreen } as const;
    const nqAtTen = resolvePositionSizing(InstrumentSymbol.NQ, 10);

    function candidateOut(
        arguments_: FundedCandidateArguments,
        label: RegExp,
    ): SimOutputs {
        const candidate = readFundedCandidates(
            arguments_,
            stopRule,
            nqAtTen,
        ).find((entry) => label.test(entry.label));
        if (!candidate) throw new Error(`no candidate matches ${label}`);
        return simulate({
            ...baseSimInputs(0),
            dayStop: stopRule,
            instrument: InstrumentSymbol.NQ,
            stopPoints: 10,
            trials: 40,
            ...candidate.overrides,
        });
    }

    it('trades a 250/250/250/250 ladder exactly like flat $250, both placing one NQ contract ($200) per trade', () => {
        const ladder = candidateOut(
            { flat: '', 'funded-ladder': '250,250,250,250', percent: '' },
            /^ladder/,
        );
        const flat = candidateOut({ flat: '250', percent: '' }, /^flat/);
        expect(ladder).toStrictEqual(flat);
    });

    it('labels each ladder rung with the whole contracts it places', () => {
        const candidates = readFundedCandidates(
            { flat: '', 'funded-ladder': '250,600', percent: '' },
            stopRule,
            nqAtTen,
        );
        expect(candidates.map((candidate) => candidate.label)).toStrictEqual([
            'ladder 250/600 (1/3 NQ = $200/$600)',
        ]);
    });

    it('refuses a ladder rung below one contract at the stop instead of trading one contract under its label', () => {
        expect(() =>
            readFundedCandidates(
                { flat: '', 'funded-ladder': '150,400', percent: '' },
                stopRule,
                nqAtTen,
            ),
        ).toThrow(
            /--funded-ladder[\s\S]*\$150[\s\S]*one NQ contract[\s\S]*\$200/,
        );
    });
});

describe('optimize funded candidate filters agree with simInputsSizingIssue (WP40, WP39b handoff)', () => {
    const stopRule = { kind: DayStopRuleKind.DayGreen } as const;
    const nqAtTen = resolvePositionSizing(InstrumentSymbol.NQ, 10);

    it.each([150, 199.99, 200, 250, 400])(
        'places flat $%d exactly when the shared check accepts it at an NQ 10 point stop',
        (dollar) => {
            const isAccepted =
                simInputsSizingIssue({
                    fundedRiskPerTrade: dollar,
                    instrument: InstrumentSymbol.NQ,
                    riskPerTrade: dollar,
                    stopPoints: 10,
                }) === null;
            const labels = readFundedCandidates(
                { flat: `${dollar},400`, percent: '' },
                stopRule,
                nqAtTen,
            ).map((candidate) => candidate.label);
            expect(
                labels.some((label) => label.startsWith(`flat $${dollar} `)),
            ).toBe(isAccepted);
        },
    );

    it('refuses an explicit --percent without a stop exactly when the shared check refuses a percent policy without one', () => {
        expect(
            simInputsSizingIssue({
                fundedCushionPercent: fraction(0.1),
                riskPerTrade: 0,
            }),
        ).not.toBeNull();
        expect(() =>
            readFundedCandidates({ flat: '', percent: '10' }, stopRule, null),
        ).toThrow(/--percent[\s\S]*--stop-points/);
        expect(
            simInputsSizingIssue({
                fundedCushionPercent: fraction(0.1),
                instrument: InstrumentSymbol.NQ,
                riskPerTrade: 0,
                stopPoints: 10,
            }),
        ).toBeNull();
        expect(
            readFundedCandidates(
                { flat: '', percent: '10' },
                stopRule,
                nqAtTen,
            ).map((candidate) => candidate.label),
        ).toStrictEqual(['10% cushion']);
    });
});

describe('optimize funded shows the horizon credit and a credit-free monthly net (N-72)', () => {
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

    it('prints per-cycle net, horizon credit, monthly net and monthly ex-credit, in that order', async () => {
        const result = await capturedRun([...SMALL_RUN, '--flat', '200']);
        expect(result.exitCode).toBeUndefined();
        expect(result.stdout).toMatch(
            /per-cycle net\s+horizon credit\s+monthly net\s+monthly ex-credit\s+bust when funded\s+survivors/,
        );
    });

    it('formats every money column of a row from its own SimOutputs field', () => {
        const out: SimOutputs = {
            ...base,
            expectedHorizonCredit: 4012.4,
            expectedMonthlyNet: 7129.2,
            expectedMonthlyRealizedNet: 2356.3,
            expectedNet: 1987.1,
            fundedBustProbability: 0.25,
            fundedSurvivalProbability: 0.054,
        };
        expect(fundedRowCells('flat $1000', out, 2000)).toStrictEqual([
            'flat $1000',
            formatCurrency(1987.1),
            formatCurrency(4012.4),
            formatCurrency(7129.2),
            formatCurrency(2356.3),
            formatPercent(0.25),
            '108/2000',
        ]);
    });
});
