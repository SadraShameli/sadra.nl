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
    ALL_FIRMS,
    ApexVariant,
    DayStopRuleKind,
    findFirm,
    FirmId,
    fraction,
    InstrumentSymbol,
    MffuVariant,
    newFundedCycleTracker,
    PayoutProfitPool,
    type Plan,
    PolicySizing,
    policySizingOf,
    profitShareMultiplier,
    resolvePositionSizing,
    type SimInputs,
    type SimOutputs,
    simulate,
    TradeifyVariant,
    TRADING_DAYS_PER_MONTH,
    TradingPhase,
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
            'capped by the payout profit pool (cycle profit since the last payout on cycle-pool plans) only when there is no payout ladder and no payout profit share',
        );
        expect(description).toContain(
            '0 once a lifetime payout cap is reached or the payout ladder is exhausted',
        );
    });

    it('says a denying payout ladder credits 0 below its step and that the timing gates are ignored (N-71, N-72, WP43)', () => {
        const description = sortDescription(
            FundedSortKey.Monthly,
            baseSimInputs(0),
        );
        expect(description).toContain(
            'a payout ladder that denies an unaffordable step credits 0 when the step is above what the account could withdraw (its withdrawable balance, or its profit share if lower)',
        );
        expect(description).not.toContain(
            'when the withdrawable room is below the step',
        );
        expect(description).toContain(
            'the credit ignores the payout day and qualifying-day gate, the consistency rule, the minimum payout profit and the minimum request',
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

describe('the monthly sort note credit details match the engine (N-71, N-72, WP43b)', () => {
    it('says the credit is net of the payout method fee as well as the split, as Plan.payoutFromProfit subtracts it', () => {
        const description = sortDescription(
            FundedSortKey.Monthly,
            baseSimInputs(0),
        );
        expect(description).toContain(
            'net of the split and the payout method fee',
        );
    });

    it('closeoutCredit subtracts the payout method fee from the capped request, so the note has to say so', () => {
        const target = ALL_FIRMS.flatMap((firm) => firm.plans).find(
            (plan) => plan.payoutMethodFee > 0,
        );
        if (!target) throw new Error('no plan with a payout method fee');
        const feeFree = Object.create(target) as Plan;
        Object.defineProperty(feeFree, 'payoutMethodFee', { value: 0 });

        const creditOn = (plan: Plan): number => {
            const state = plan.initialState();
            state.threshold = state.startingBalance + 100;
            state.thresholdLocked = true;
            state.qualifyingDays = 999;
            state.balance = plan.payoutBalanceFloor(state, 0) + 1_000_000;
            const tracker = newFundedCycleTracker(state);
            tracker.lastPayoutBalance = state.startingBalance;
            return tracker.closeoutCredit({
                minRetainedCushion: 0,
                plan,
                state,
            });
        };
        const feeFreeCredit = creditOn(feeFree);
        expect(feeFreeCredit).toBeGreaterThan(target.payoutMethodFee);
        expect(creditOn(target)).toBeCloseTo(
            feeFreeCredit - target.payoutMethodFee,
            6,
        );
    });

    it('a denying ladder credits 0 when its step is above the profit share, even with the withdrawable balance above the step (WP43c)', () => {
        const apexEod = planResolver.resolveOne({
            firm: FirmId.Apex,
            variant: ApexVariant.Eod,
        });
        expect(apexEod.payoutLadder?.deniesIfUnaffordable).toBe(true);
        expect(apexEod.payoutProfitShare).toBeNull();
        const step = apexEod.payoutLadder?.steps[0];
        if (step === undefined) throw new Error('apex eod ladder step missing');
        const withProfitShare = (share: number): Plan =>
            apexEod.withOverrides({
                payoutProfitShare: profitShareMultiplier(share),
            });

        const creditOn = (plan: Plan, cycleProfit: number): number => {
            const state = plan.initialState();
            state.threshold = state.startingBalance + 100;
            state.thresholdLocked = true;
            state.qualifyingDays = 999;
            state.balance = plan.payoutBalanceFloor(state, 0) + step * 4;
            const tracker = newFundedCycleTracker(state);
            tracker.lastPayoutBalance = state.balance - cycleProfit;
            return tracker.closeoutCredit({
                minRetainedCushion: 0,
                plan,
                state,
            });
        };

        expect(creditOn(apexEod, step * 2)).toBeGreaterThan(0);
        expect(creditOn(withProfitShare(1), step * 2)).toBeGreaterThan(0);
        expect(creditOn(withProfitShare(1), step / 2)).toBe(0);
    });

    it('names no firm in the denying-ladder sentence, whatever plan is ranked', () => {
        const apexEod = planResolver.resolveOne({
            firm: FirmId.Apex,
            variant: ApexVariant.Eod,
        });
        expect(apexEod.payoutLadder?.deniesIfUnaffordable).toBe(true);
        for (const plan of [registryPlan(), apexEod]) {
            const description = sortDescription(FundedSortKey.Monthly, {
                ...baseSimInputs(0),
                plan,
            });
            const namedFirms = ALL_FIRMS.filter((firm) =>
                [firm.id, firm.displayName].some((name) =>
                    new RegExp(String.raw`\b${name}\b`, 'i').test(description),
                ),
            ).map((firm) => firm.id);
            expect(namedFirms).toEqual([]);
            expect(description).not.toContain('Intraday');
        }
    });
});

describe('the monthly sort note skips the payout pool under a profit share, as closeoutCredit does (N-72, WP43)', () => {
    it('Tradeify Select Daily credits its 2x profit share of the cycle profit, not the smaller cycle profit pool', () => {
        const target = findFirm(FirmId.Tradeify)?.findPlan({
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.SelectDaily,
        });
        if (!target) throw new Error('tradeify select daily missing');
        const share = target.payoutProfitShare;
        if (share === null)
            throw new Error('select daily profit share missing');
        expect(share).toBe(2);
        expect(target.payoutLadder).toBeNull();
        expect(target.payoutProfitPool).toBe(PayoutProfitPool.CycleProfit);

        const state = target.initialState();
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        state.balance = target.payoutBalanceFloor(state, 0) + 1_000_000;
        const tracker = newFundedCycleTracker(state);
        const cycleProfit = 500;
        tracker.lastPayoutBalance = state.balance - cycleProfit;
        tracker.payoutsIssued = 1;
        const options = { minRetainedCushion: 0, plan: target, state };
        const withdrawable = tracker.withdrawableNow(options);
        const profitShareCap = share * cycleProfit;
        expect(profitShareCap).toBeGreaterThan(cycleProfit);
        expect(withdrawable).toBeGreaterThan(profitShareCap);

        const credit = tracker.closeoutCredit(options);
        expect(credit).toBeCloseTo(
            target.payoutFromProfit(profitShareCap, 1),
            6,
        );
        expect(credit).toBeGreaterThan(target.payoutFromProfit(cycleProfit, 1));
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

    it('builds a ladder candidate with the funded policy sizing and its plain label when no stop is given', () => {
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
            sizing: policySizingOf(TradingPhase.Funded),
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

describe('optimize funded --funded-ladder refuses a rung with the cent-tolerant check and prints money in whole cents (WP39d)', () => {
    const stopRule = { kind: DayStopRuleKind.DayGreen } as const;
    const esAtOnePointOne = resolvePositionSizing(InstrumentSymbol.ES, 1.1);

    it('accepts a $55 rung as one ES contract at a 1.1 point stop, whose contract risk is not exact in binary', () => {
        const candidates = readFundedCandidates(
            { flat: '', 'funded-ladder': '55,110', percent: '' },
            stopRule,
            esAtOnePointOne,
        );
        expect(candidates.map((candidate) => candidate.label)).toStrictEqual([
            'ladder 55/110 (1/2 ES = $55/$110)',
        ]);
    });

    it('refuses a $54.99 rung there, naming the one-contract risk in whole cents', () => {
        let message = '';
        try {
            readFundedCandidates(
                { flat: '', 'funded-ladder': '54.99,110', percent: '' },
                stopRule,
                esAtOnePointOne,
            );
        } catch (error) {
            message = error instanceof Error ? error.message : String(error);
        }
        expect(message).toContain(
            "$54.99 below one ES contract's risk at a 1.1 point stop ($55)",
        );
        expect(message).not.toMatch(/55\.0000/);
    });

    it('prints a placed rung risk that is not exact in binary in whole cents', () => {
        const candidates = readFundedCandidates(
            { flat: '', 'funded-ladder': '80,50', percent: '' },
            stopRule,
            resolvePositionSizing(InstrumentSymbol.MNQ, 12.3),
        );
        expect(candidates.map((candidate) => candidate.label)).toStrictEqual([
            'ladder 80/50 (3/2 MNQ = $73.80/$49.20)',
        ]);
    });

    it.each([
        {
            minimum: '$50.01',
            rung: '50',
            stopPoints: '1.0001',
            symbol: InstrumentSymbol.ES,
        },
        {
            minimum: '$24.61',
            rung: '24.6',
            stopPoints: '12.301',
            symbol: InstrumentSymbol.MNQ,
        },
    ])(
        'names the one-contract risk rounded up to whole cents ($minimum) when refusing a $rung rung at a $stopPoints point stop, and accepts a rung of that amount',
        ({ minimum, rung, stopPoints, symbol }) => {
            const positionSizing = resolvePositionSizing(
                symbol,
                Number(stopPoints),
            );
            expect(() =>
                readFundedCandidates(
                    { flat: '', 'funded-ladder': `${rung},200`, percent: '' },
                    stopRule,
                    positionSizing,
                ),
            ).toThrow(`point stop (${minimum})`);
            const accepted = readFundedCandidates(
                {
                    flat: '',
                    'funded-ladder': `${minimum.slice(1)},200`,
                    percent: '',
                },
                stopRule,
                positionSizing,
            );
            expect(accepted[0]?.label).toMatch(
                new RegExp(String.raw`^ladder ${minimum.slice(1)}/200 \(1/`),
            );
        },
    );

    it('prints a placed flat risk that is not exact in binary in whole cents, next to the ladder row', () => {
        const candidates = readFundedCandidates(
            { flat: '80', 'funded-ladder': '80,50', percent: '' },
            stopRule,
            resolvePositionSizing(InstrumentSymbol.MNQ, 12.3),
        );
        expect(candidates.map((candidate) => candidate.label)).toStrictEqual([
            'flat $80 (3 MNQ = $73.80)',
            'ladder 80/50 (3/2 MNQ = $73.80/$49.20)',
        ]);
    });

    it('prints the below-one-contract flat note in whole cents, with the one-contract risk rounded up', async () => {
        const result = await capturedRun([
            ...SMALL_RUN,
            '--flat',
            '20,80',
            '--percent',
            '',
            '--instrument',
            'MNQ',
            '--stop-points',
            '12.301',
        ]);
        expect(result.exitCode).toBeUndefined();
        expect(result.stdout).toContain(
            "flat $20 left out: below one MNQ contract's risk at a 12.301 point stop ($24.61)",
        );
        expect(result.stdout).toContain('flat $80 (3 MNQ = $73.80)');
        expect(result.stdout).not.toMatch(/24\.60[0-9]|73\.80[0-9]/);
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

function capturedCapRun(
    variant: MffuVariant,
    flat = '80,150,1000',
    extra: string[] = [],
) {
    return capturedRun([
        '--firm',
        'mffu',
        '--variant',
        variant,
        '--trials',
        '5',
        '--eval-days',
        '5',
        '--funded-days',
        '5',
        '--seed',
        '7',
        '--instrument',
        'MNQ',
        '--stop-points',
        '10',
        '--flat',
        flat,
        '--percent',
        '',
        ...extra,
    ]);
}

function mffPlan(variant: MffuVariant): Plan {
    return planResolver.resolveOne({ firm: FirmId.Mffu, variant });
}

describe('optimize funded labels show the placement at the funded start-tier contract cap and name flats that collapse to one policy (N-75, WP42)', () => {
    const stopRule = { kind: DayStopRuleKind.DayGreen } as const;
    const capSuffix = 'by the funded contract limit at the start tier';

    it('labels MFF Pro flat rows at the 5 MNQ start-tier cap and leaves an uncapped row unchanged', () => {
        const candidates = readFundedCandidates(
            { flat: '80,150,1000', percent: '' },
            stopRule,
            mnqAtTen,
            mffPlan(MffuVariant.Pro),
        );
        expect(candidates.map((candidate) => candidate.label)).toStrictEqual([
            'flat $80 (4 MNQ = $80)',
            `flat $150 (7 MNQ = $140, capped at 5 MNQ = $100 ${capSuffix})`,
            `flat $1000 (50 MNQ = $1,000, capped at 5 MNQ = $100 ${capSuffix})`,
        ]);
    });

    it('labels MFF Rapid flat rows with no cap marker, since 50 MNQ fits its 50 micro funded limit', () => {
        const candidates = readFundedCandidates(
            { flat: '80,150,1000', percent: '' },
            stopRule,
            mnqAtTen,
            mffPlan(MffuVariant.Rapid),
        );
        expect(candidates.map((candidate) => candidate.label)).toStrictEqual([
            'flat $80 (4 MNQ = $80)',
            'flat $150 (7 MNQ = $140)',
            'flat $1000 (50 MNQ = $1,000)',
        ]);
    });

    it('labels an MFF Pro ladder with the capped rung placements', () => {
        const candidates = readFundedCandidates(
            { flat: '', 'funded-ladder': '80,150', percent: '' },
            stopRule,
            mnqAtTen,
            mffPlan(MffuVariant.Pro),
        );
        expect(candidates.map((candidate) => candidate.label)).toStrictEqual([
            `ladder 80/150 (4/7 MNQ = $80/$140, capped at 4/5 MNQ = $80/$100 ${capSuffix})`,
        ]);
    });

    it('prints the capped labels and a note that flat $150 and $1000 are one policy on MFF Pro', async () => {
        const result = await capturedCapRun(MffuVariant.Pro);
        expect(result.exitCode).toBeUndefined();
        expect(result.stdout).toContain('flat $80 (4 MNQ = $80)');
        expect(result.stdout).not.toMatch(/flat \$80 \(4 MNQ = \$80, capped/);
        expect(result.stdout).toContain(
            `flat $150 (7 MNQ = $140, capped at 5 MNQ = $100 ${capSuffix})`,
        );
        expect(result.stdout).toContain(
            `flat $1000 (50 MNQ = $1,000, capped at 5 MNQ = $100 ${capSuffix})`,
        );
        expect(result.stdout).toContain(
            'flat $150 and $1,000 place the same 5 MNQ = $100, so their rows are one policy',
        );
        expect(result.stdout).toContain(
            'a flat or ladder label shows the placement at the funded contract limit at the start tier',
        );
    });

    it('prints a capped ladder row on MFF Pro', async () => {
        const result = await capturedCapRun(MffuVariant.Pro, '80,150,1000', [
            '--funded-ladder',
            '80,150',
        ]);
        expect(result.exitCode).toBeUndefined();
        expect(result.stdout).toContain(
            `ladder 80/150 (4/7 MNQ = $80/$140, capped at 4/5 MNQ = $80/$100 ${capSuffix})`,
        );
    });

    it('prints no cap marker and no collapse note on MFF Rapid', async () => {
        const result = await capturedCapRun(MffuVariant.Rapid);
        expect(result.exitCode).toBeUndefined();
        expect(result.stdout).toContain('flat $1000 (50 MNQ = $1,000)');
        expect(result.stdout).not.toContain('capped at');
        expect(result.stdout).not.toContain('one policy');
    });

    it('names every flat of three or more that places the same risk', async () => {
        const result = await capturedCapRun(MffuVariant.Pro, '100,150,1000');
        expect(result.exitCode).toBeUndefined();
        expect(result.stdout).toContain(
            'flat $100, $150 and $1,000 place the same 5 MNQ = $100, so their rows are one policy',
        );
    });

    it('prints no one-policy note on Apex EOD, whose tiered funded contract limit lets a larger flat place more after the start tier', async () => {
        const result = await capturedRun([
            '--firm',
            'apex',
            '--variant',
            ApexVariant.Eod,
            '--size',
            '50000',
            '--trials',
            '5',
            '--eval-days',
            '5',
            '--funded-days',
            '5',
            '--seed',
            '7',
            '--instrument',
            'MNQ',
            '--stop-points',
            '10',
            '--flat',
            '400,500,1000',
            '--percent',
            '',
        ]);
        expect(result.exitCode).toBeUndefined();
        expect(result.stdout).toContain(
            `flat $1000 (50 MNQ = $1,000, capped at 20 MNQ = $400 ${capSuffix})`,
        );
        expect(result.stdout).not.toContain('one policy');
        expect(result.stdout).not.toContain('place the same');
    });
});
