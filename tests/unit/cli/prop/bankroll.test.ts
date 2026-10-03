import { type CommandDef, parseArgs } from 'citty';
import { stripVTControlCharacters } from 'node:util';
import { describe, expect, it, vi } from 'vitest';

import {
    assertSingleAttemptPricing,
    BankrollMaxAttemptsRefused,
    toBankrollTimelineInputs,
} from '~/cli/commands/prop/bankroll/bankrollFlags';
import batchCommand, {
    batchArguments,
} from '~/cli/commands/prop/bankroll/batch';
import compareCommand, {
    compareArguments,
} from '~/cli/commands/prop/bankroll/compare';
import curveCommand, {
    curveArguments,
    curveRows,
} from '~/cli/commands/prop/bankroll/curve';
import bankrollGroup from '~/cli/commands/prop/bankroll/group';
import leversCommand, {
    leversArguments,
    leverVariants,
} from '~/cli/commands/prop/bankroll/levers';
import projectCommand, {
    closedFormIllustration,
    projectArguments,
    projectMonthEndCells,
    projectSummaryRows,
} from '~/cli/commands/prop/bankroll/project';
import riskCommand, {
    riskArguments,
    riskRows,
} from '~/cli/commands/prop/bankroll/risk';
import {
    edgePlausibilityNote,
    TradingInputs,
} from '~/cli/commands/prop/shared';
import { formatCurrency, formatPercent } from '~/lib/format';
import {
    dollars,
    findFirm,
    FirmId,
    fraction,
    MffuVariant,
    simulate,
} from '~/lib/prop-calculator';
import { BankrollLeverKind } from '~/lib/prop-calculator/economics';
import { simulateBankrollTimeline } from '~/lib/prop-calculator/portfolioTimeline';

import { acceptedFlags, flagsNamedButNotAccepted } from './helpFlags';

const SMALL_PLAN = ['--firm', 'mffu', '--variant', 'rapid-eod'];
const SMALL_SIM = [
    ...SMALL_PLAN,
    '--trials',
    '40',
    '--eval-days',
    '20',
    '--funded-days',
    '20',
];

async function capturedFailure(
    command: { run?: (context: never) => Promise<void> | void },
    args: unknown,
    argv: string[],
): Promise<{
    exitCode: number | string | undefined;
    stderr: string;
    stdout: string;
}> {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const write = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation((chunk: string | Uint8Array) => {
            stdout.push(String(chunk));
            return true;
        });
    const writeError = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation((chunk: string | Uint8Array) => {
            stderr.push(String(chunk));
            return true;
        });
    const previous = process.exitCode;
    process.exitCode = undefined;
    try {
        await command.run?.({ args, cmd: command, rawArgs: argv } as never);
        return {
            exitCode: process.exitCode,
            stderr: stripVTControlCharacters(stderr.join('')),
            stdout: stripVTControlCharacters(stdout.join('')),
        };
    } finally {
        write.mockRestore();
        writeError.mockRestore();
        process.exitCode = previous;
    }
}

async function capturedRun(
    command: { run?: (context: never) => Promise<void> | void },
    args: unknown,
    argv: string[],
): Promise<string> {
    const written: string[] = [];
    const write = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation((chunk: string | Uint8Array) => {
            written.push(String(chunk));
            return true;
        });
    const writeError = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);
    const exitCode = process.exitCode;
    try {
        await command.run?.({ args, cmd: command, rawArgs: argv } as never);
    } finally {
        write.mockRestore();
        writeError.mockRestore();
        process.exitCode = exitCode;
    }
    return written.join('');
}

function moneyAfter(stdout: string, label: string): number {
    const escaped = label.replaceAll(/[()/]/g, String.raw`\$&`);
    const match = new RegExp(String.raw`${escaped}\s+(-?)\$([\d,]+)`).exec(
        stdout,
    );
    if (match === null) throw new Error(`no money after ${label}`);
    return Number(`${match[1]}${(match[2] ?? '').replaceAll(',', '')}`);
}

async function plainRun(
    command: { run?: (context: never) => Promise<void> | void },
    args: unknown,
    argv: string[],
): Promise<string> {
    return stripVTControlCharacters(await capturedRun(command, args, argv));
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

describe('prop bankroll group wires all six subcommands', () => {
    it('lazily resolves batch, compare, curve, levers, project and risk', async () => {
        const subCommands = bankrollGroup.subCommands ?? {};
        const names = Object.keys(subCommands).toSorted((a, b) =>
            a.localeCompare(b),
        );
        expect(names).toStrictEqual([
            'batch',
            'compare',
            'curve',
            'levers',
            'project',
            'risk',
        ]);
        for (const resolver of Object.values(subCommands)) {
            const resolved =
                typeof resolver === 'function'
                    ? await (resolver as () => Promise<CommandDef>)()
                    : (resolver as CommandDef);
            expect(resolved).toBeTruthy();
        }
    });
});

describe('prop bankroll risk', () => {
    it('accepts --budget, --pass-rate, --payout-rate and --loss-threshold', async () => {
        expect(await acceptedFlags(riskCommand)).toEqual(
            expect.arrayContaining([
                'budget',
                'pass-rate',
                'payout-rate',
                'loss-threshold',
            ]),
        );
        expect(await flagsNamedButNotAccepted(riskCommand)).toStrictEqual([]);
    });

    it('prints attempt cost, attempts affordable, P(attempt pays), the batch loss headline and the no-payout secondary line', async () => {
        const stdout = await capturedRun(
            riskCommand,
            parseArgs<typeof riskArguments>(
                [...SMALL_SIM, '--budget', '5000'],
                riskArguments,
            ),
            SMALL_SIM,
        );
        expect(stdout).toContain('attempt cost');
        expect(stdout).toContain('attempts affordable');
        expect(stdout).toContain('P(attempt pays)');
        expect(stdout).toContain('P(batch net < 0)');
        expect(stdout).toMatch(/P\(no payout from \d+ attempts\)/);
    });

    it('prints "threshold not set" when no --loss-threshold is given and the edge is positive', () => {
        const positiveEdgeArgs = [
            ...SMALL_PLAN,
            '--trials',
            '40',
            '--eval-days',
            '20',
            '--funded-days',
            '20',
            '--winrate',
            '0.9',
            '--rr',
            '3',
        ];
        const out = simulate(
            TradingInputs.parse(
                parseArgs<typeof riskArguments>(
                    positiveEdgeArgs,
                    riskArguments,
                ),
            ).toSimInputs(rapidEodPlan()),
        );
        const rows = riskRows(
            out,
            {
                budget: 5000 as never,
                lossThreshold: null,
                passRateOverride: null,
                payoutRateOverride: null,
            },
            1,
        );
        const row = rows.find(
            ([label]) => label === 'minimum budget for the loss target',
        );
        expect(row?.[1]).toBe('threshold not set');
    });

    it('prints "no positive edge" when the mean net per attempt is not positive', () => {
        const negativeEdgeArgs = [
            ...SMALL_PLAN,
            '--trials',
            '40',
            '--eval-days',
            '20',
            '--funded-days',
            '20',
            '--winrate',
            '0.1',
            '--rr',
            '1',
        ];
        const out = simulate(
            TradingInputs.parse(
                parseArgs<typeof riskArguments>(
                    negativeEdgeArgs,
                    riskArguments,
                ),
            ).toSimInputs(rapidEodPlan()),
        );
        const rows = riskRows(
            out,
            {
                budget: 5000 as never,
                lossThreshold: fraction(0.05),
                passRateOverride: null,
                payoutRateOverride: null,
            },
            1,
        );
        const row = rows.find(
            ([label]) => label === 'minimum budget for the loss target',
        );
        expect(row?.[1]).toBe('no positive edge');
    });

    it('shows the modeled rate beside a --pass-rate override with the override note', () => {
        const out = simulate(
            TradingInputs.parse(
                parseArgs<typeof riskArguments>(SMALL_SIM, riskArguments),
            ).toSimInputs(rapidEodPlan()),
        );
        const rows = riskRows(
            out,
            {
                budget: 5000 as never,
                lossThreshold: null,
                passRateOverride: fraction(0.9),
                payoutRateOverride: null,
            },
            1,
        );
        const row = rows.find(([label]) => label === 'P(pass per attempt)');
        expect(row?.[1]).toContain('90.0%');
        expect(row?.[1]).toContain(
            'override is an input, not derived from your win rate, rr and risk',
        );
    });
});

describe('toBankrollTimelineInputs refuses an eval ladder loud instead of silently flattening it', () => {
    it('throws when --ladder was passed, instead of dropping to flat risk sizing', () => {
        const inputs = TradingInputs.parse(
            parseArgs<typeof projectArguments>(
                [...SMALL_SIM, '--ladder', '400,600,800'],
                projectArguments,
            ),
        );
        const plan = rapidEodPlan();
        expect(() =>
            toBankrollTimelineInputs(
                inputs,
                plan,
                {
                    maxConcurrentAccounts: null,
                    monthlyBudget: null,
                    payoutLagDays: 0,
                    reinvestFraction: fraction(1),
                    roundBudget: null,
                    startingBankroll: 5000 as never,
                },
                60,
                30,
            ),
        ).toThrow(/ladder/i);
    });

    it('does not throw without --ladder', () => {
        const inputs = TradingInputs.parse(
            parseArgs<typeof projectArguments>(SMALL_SIM, projectArguments),
        );
        const plan = rapidEodPlan();
        expect(() =>
            toBankrollTimelineInputs(
                inputs,
                plan,
                {
                    maxConcurrentAccounts: null,
                    monthlyBudget: null,
                    payoutLagDays: 0,
                    reinvestFraction: fraction(1),
                    roundBudget: null,
                    startingBankroll: 5000 as never,
                },
                60,
                30,
            ),
        ).not.toThrow();
    });
});

describe('toBankrollTimelineInputs applies funded-phase flat parameter overrides instead of refusing them (PT-55b)', () => {
    it('applies --funded-risk, --funded-rr and --funded-tpd to the funded phase', () => {
        const inputs = TradingInputs.parse(
            parseArgs<typeof projectArguments>(
                [
                    ...SMALL_SIM,
                    '--risk',
                    '500',
                    '--rr',
                    '2',
                    '--tpd',
                    '1',
                    '--funded-risk',
                    '250',
                    '--funded-rr',
                    '3',
                    '--funded-tpd',
                    '2',
                ],
                projectArguments,
            ),
        );
        const plan = rapidEodPlan();
        const result = toBankrollTimelineInputs(
            inputs,
            plan,
            {
                maxConcurrentAccounts: null,
                monthlyBudget: null,
                payoutLagDays: 0,
                reinvestFraction: fraction(1),
                roundBudget: null,
                startingBankroll: 5000 as never,
            },
            60,
            30,
        );

        expect(result.fundedRiskPerTrade).toBe(250);
        expect(result.fundedRrRatio).toBe(3);
        expect(result.fundedTradesPerDay).toBe(2);
        expect(result.riskPerTrade).toBe(500);
        expect(result.rrRatio).toBe(2);
        expect(result.tradesPerDay).toBe(1);
    });

    it('does not throw when --funded-risk equals --risk', () => {
        const inputs = TradingInputs.parse(
            parseArgs<typeof projectArguments>(
                [...SMALL_SIM, '--risk', '500', '--funded-risk', '500'],
                projectArguments,
            ),
        );
        const plan = rapidEodPlan();
        expect(() =>
            toBankrollTimelineInputs(
                inputs,
                plan,
                {
                    maxConcurrentAccounts: null,
                    monthlyBudget: null,
                    payoutLagDays: 0,
                    reinvestFraction: fraction(1),
                    roundBudget: null,
                    startingBankroll: 5000 as never,
                },
                60,
                30,
            ),
        ).not.toThrow();
    });
});

describe('prop bankroll project', () => {
    it('prints bankroll bands, path ruin, P(final net < 0) and the deterministic-illustration label', async () => {
        const stdout = await capturedRun(
            projectCommand,
            parseArgs<typeof projectArguments>(
                [
                    ...SMALL_SIM,
                    '--start',
                    '5000',
                    '--horizon-days',
                    '40',
                    '--trials',
                    '30',
                ],
                projectArguments,
            ),
            SMALL_SIM,
        );
        expect(stdout).toContain('bankroll (P10 / P50 / P90)');
        expect(stdout).toContain('path ruin');
        expect(stdout).toContain('P(final net < 0)');
        expect(stdout).toContain('deterministic illustration, not a forecast');
    });

    it('labels the closed-form path as an illustration, not a forecast', () => {
        expect(
            closedFormIllustration({
                horizonDays: 60,
                reinvest: fraction(1),
                start: 5000 as never,
            }),
        ).toMatch(/illustrative cycle/);
    });

    it('reports n/a when reinvest is 0, since there is no compounding cycle to illustrate', () => {
        expect(
            closedFormIllustration({
                horizonDays: 60,
                reinvest: fraction(0),
                start: 5000 as never,
            }),
        ).toContain('n/a');
    });

    it('prints the edge plausibility note the way prop sim does, with a funded-phase override given (PT-55c)', async () => {
        const stdout = await capturedRun(
            projectCommand,
            parseArgs<typeof projectArguments>(
                [
                    ...SMALL_SIM,
                    '--start',
                    '5000',
                    '--horizon-days',
                    '40',
                    '--trials',
                    '30',
                    '--winrate',
                    '0.7',
                    '--rr',
                    '1',
                    '--tpd',
                    '4',
                    '--funded-risk',
                    '1000',
                    '--funded-rr',
                    '1.5',
                    '--funded-tpd',
                    '2',
                ],
                projectArguments,
            ),
            SMALL_SIM,
        );
        expect(stdout).toContain(
            edgePlausibilityNote({
                rrRatio: 1,
                tradesPerDay: 4,
                winrate: fraction(0.7),
            }) ?? 'missing note',
        );
        expect(stdout).toContain(
            edgePlausibilityNote({
                rrRatio: 1.5,
                tradesPerDay: 2,
                winrate: fraction(0.7),
            }) ?? 'missing note',
        );
        expect(stdout).toContain('at 4 trades per day over 21 trading days');
        expect(stdout).toContain('at 2 trades per day over 21 trading days');
    });
});

describe('prop bankroll compare', () => {
    it('prints a per-risk row labelled as a what-if conflicting with Hard Rule 3', async () => {
        const stdout = await capturedRun(
            compareCommand,
            parseArgs<typeof compareArguments>(
                [
                    ...SMALL_SIM,
                    '--start',
                    '5000',
                    '--horizon-days',
                    '40',
                    '--risks',
                    '250,500',
                ],
                compareArguments,
            ),
            SMALL_SIM,
        );
        expect(stdout).toContain('what-if: conflicts with Hard Rule 3');
    });

    it('does not label the plain configured-risk row as a what-if when --risks is omitted', async () => {
        const stdout = await capturedRun(
            compareCommand,
            parseArgs<typeof compareArguments>(
                [...SMALL_SIM, '--start', '5000', '--horizon-days', '40'],
                compareArguments,
            ),
            SMALL_SIM,
        );
        expect(stdout).not.toContain('what-if: conflicts with Hard Rule 3');
    });

    it('prints the closed-form comparison for --multiples with the illustration label', async () => {
        const stdout = await capturedRun(
            compareCommand,
            parseArgs<typeof compareArguments>(
                [
                    ...SMALL_SIM,
                    '--start',
                    '5000',
                    '--horizon-days',
                    '60',
                    '--multiples',
                    '5@60,3@30',
                ],
                compareArguments,
            ),
            SMALL_SIM,
        );
        expect(stdout).toContain('deterministic illustration, not a forecast');
        expect(stdout).toContain('5@60');
        expect(stdout).toContain('3@30');
    });

    it('prints the edge plausibility note the way prop sim does, with a funded-phase override given (PT-55c)', async () => {
        const stdout = await capturedRun(
            compareCommand,
            parseArgs<typeof compareArguments>(
                [
                    ...SMALL_SIM,
                    '--start',
                    '5000',
                    '--horizon-days',
                    '40',
                    '--winrate',
                    '0.7',
                    '--rr',
                    '1',
                    '--tpd',
                    '4',
                    '--funded-risk',
                    '1000',
                    '--funded-rr',
                    '1.5',
                    '--funded-tpd',
                    '2',
                ],
                compareArguments,
            ),
            SMALL_SIM,
        );
        expect(stdout).toContain(
            edgePlausibilityNote({
                rrRatio: 1,
                tradesPerDay: 4,
                winrate: fraction(0.7),
            }) ?? 'missing note',
        );
        expect(stdout).toContain(
            edgePlausibilityNote({
                rrRatio: 1.5,
                tradesPerDay: 2,
                winrate: fraction(0.7),
            }) ?? 'missing note',
        );
        expect(stdout).toContain('at 4 trades per day over 21 trading days');
        expect(stdout).toContain('at 2 trades per day over 21 trading days');
    });

    it('does not print the edge plausibility note for --multiples, since that closed-form illustration never uses winrate/rr (PT-55c)', async () => {
        const stdout = await capturedRun(
            compareCommand,
            parseArgs<typeof compareArguments>(
                [
                    ...SMALL_SIM,
                    '--start',
                    '5000',
                    '--horizon-days',
                    '60',
                    '--multiples',
                    '5@60,3@30',
                    '--winrate',
                    '0.7',
                    '--rr',
                    '1',
                    '--funded-risk',
                    '1000',
                ],
                compareArguments,
            ),
            SMALL_SIM,
        );
        expect(stdout).not.toContain(
            edgePlausibilityNote({
                rrRatio: 1,
                tradesPerDay: 4,
                winrate: fraction(0.7),
            }) ?? 'missing note',
        );
    });
});

describe('prop bankroll batch', () => {
    it('prints EV, funded value / attempt cost, P(net < 0) and the one-value binomial cross-check', async () => {
        const stdout = await capturedRun(
            batchCommand,
            parseArgs<typeof batchArguments>(
                [...SMALL_SIM, '--attempts', '50'],
                batchArguments,
            ),
            SMALL_SIM,
        );
        expect(stdout).toContain('EV over the batch');
        expect(stdout).toContain('funded value / attempt cost');
        expect(stdout).toContain('P(net < 0)');
        expect(stdout).toContain(
            'cross-check: assumes one value per paying attempt',
        );
    });
});

describe('prop bankroll levers', () => {
    it('labels risk and trades-per-day variants as conflicting with Hard Rule 3, and request-size variants as documented request unchanged', () => {
        const inputs = TradingInputs.parse(
            parseArgs<typeof leversArguments>(SMALL_SIM, leversArguments),
        );
        const plan = rapidEodPlan();
        const variants = leverVariants(inputs, plan, {
            bankroll: 2000 as never,
            requestSizes: [2000],
            risks: [250],
            tradesPerDay: [5],
        });
        expect(
            variants.filter(
                (variant) => variant.kind === BankrollLeverKind.Risk,
            ),
        ).toHaveLength(1);
        expect(
            variants.filter(
                (variant) => variant.kind === BankrollLeverKind.TradesPerDay,
            ),
        ).toHaveLength(1);
        expect(
            variants.filter(
                (variant) => variant.kind === BankrollLeverKind.RequestSize,
            ),
        ).toHaveLength(1);
    });

    it('prints the lever table with its labels', async () => {
        const stdout = await capturedRun(
            leversCommand,
            parseArgs<typeof leversArguments>(
                [...SMALL_SIM, '--bankroll', '2000', '--request-sizes', '2000'],
                leversArguments,
            ),
            SMALL_SIM,
        );
        expect(stdout).toContain('what-if: conflicts with Hard Rule 3');
        expect(stdout).toContain('what-if: documented request unchanged');
        expect(stdout).toContain('base');
    });
});

function modeledRun(): { out: ReturnType<typeof simulate> } {
    return {
        out: simulate(
            TradingInputs.parse(
                parseArgs<typeof riskArguments>(SMALL_SIM, riskArguments),
            ).toSimInputs(rapidEodPlan()),
        ),
    };
}

describe('prop bankroll shows the modeled rate beside an override (PT-80)', () => {
    it('prints the --pass-rate override and the modeled pass rate', () => {
        const { out } = modeledRun();
        const rows = riskRows(
            out,
            {
                budget: dollars(5000),
                lossThreshold: null,
                passRateOverride: fraction(0.9123),
                payoutRateOverride: null,
            },
            1,
        );
        const row = rows.find(([label]) => label === 'P(pass per attempt)');
        expect(row?.[1]).toContain('91.2%');
        expect(row?.[1]).toContain(
            `modeled ${formatPercent(out.attemptPassProbability)}`,
        );
    });

    it('prints the --payout-rate override and the modeled pays rate', () => {
        const { out } = modeledRun();
        const rows = riskRows(
            out,
            {
                budget: dollars(5000),
                lossThreshold: null,
                passRateOverride: null,
                payoutRateOverride: fraction(0.9123),
            },
            1,
        );
        const row = rows.find(([label]) => label === 'P(attempt pays)');
        expect(row?.[1]).toContain('91.2%');
        expect(row?.[1]).toContain(
            `modeled ${formatPercent(out.attemptPaysProbability)}`,
        );
    });

    it('prints the modeled rate alone when there is no override', () => {
        const { out } = modeledRun();
        const rows = riskRows(
            out,
            {
                budget: dollars(5000),
                lossThreshold: null,
                passRateOverride: null,
                payoutRateOverride: null,
            },
            1,
        );
        const row = rows.find(([label]) => label === 'P(attempt pays)');
        expect(row?.[1]).toBe(formatPercent(out.attemptPaysProbability));
    });
});

describe('prop bankroll prices the minimum budget on the compound distribution and prints the closed-form cross-check (PT-80)', () => {
    it('prints a labelled cross-check beside a minimum budget', () => {
        const out = simulate(
            TradingInputs.parse(
                parseArgs<typeof riskArguments>(
                    [...SMALL_SIM, '--winrate', '0.9', '--rr', '3'],
                    riskArguments,
                ),
            ).toSimInputs(rapidEodPlan()),
        );
        const rows = riskRows(
            out,
            {
                budget: dollars(5000),
                lossThreshold: fraction(0.05),
                passRateOverride: null,
                payoutRateOverride: null,
            },
            1,
        );
        const minimum = rows.find(
            ([label]) => label === 'minimum budget for the loss target',
        );
        const crossCheck = rows.find(
            ([label]) => label === 'cross-check at that budget',
        );
        expect(minimum?.[1]).toMatch(/^\$/);
        expect(crossCheck?.[1]).toContain(
            'assumes one value per paying attempt',
        );
    });

    it('prints no cross-check when there is no minimum budget', () => {
        const out = simulate(
            TradingInputs.parse(
                parseArgs<typeof riskArguments>(SMALL_SIM, riskArguments),
            ).toSimInputs(rapidEodPlan()),
        );
        const rows = riskRows(
            out,
            {
                budget: dollars(5000),
                lossThreshold: null,
                passRateOverride: null,
                payoutRateOverride: null,
            },
            1,
        );
        expect(
            rows.some(([label]) => label === 'cross-check at that budget'),
        ).toBe(false);
    });
});

describe('prop bankroll refuses --max-attempts above 1 (PT-80)', () => {
    it('throws a typed error above 1 and accepts 1', () => {
        expect(() => assertSingleAttemptPricing({ maxAttempts: 3 })).toThrow(
            BankrollMaxAttemptsRefused,
        );
        expect(() =>
            assertSingleAttemptPricing({ maxAttempts: 1 }),
        ).not.toThrow();
    });

    it.each([
        ['risk', riskCommand, riskArguments],
        ['batch', batchCommand, batchArguments],
        ['levers', leversCommand, leversArguments],
        ['curve', curveCommand, curveArguments],
    ] as const)(
        'exits 1 with the typed message for bankroll %s',
        async (_name, command, argumentsDefinition) => {
            const argv = [...SMALL_SIM, '--max-attempts', '3'];
            const result = await capturedFailure(
                command,
                parseArgs(argv, argumentsDefinition as never),
                argv,
            );
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain('--max-attempts is 3');
            expect(result.stderr).toContain('retry fee');
            expect(result.stdout).not.toContain('bankroll');
        },
    );
});

describe('prop bankroll levers shows the changes (PT-80)', () => {
    it('prints the change columns and standard errors, with zero changes on the base row', async () => {
        const argv = [...SMALL_SIM, '--bankroll', '2000'];
        const { stdout } = await capturedFailure(
            leversCommand,
            parseArgs<typeof leversArguments>(argv, leversArguments),
            argv,
        );
        expect(stdout).toContain('P(pass) chg');
        expect(stdout).toContain('P(pays)');
        expect(stdout).toContain('P(pays) chg');
        expect(stdout).toContain('loss risk chg');
        expect(stdout).toContain('(SE ');
        const baseLine = stdout
            .split('\n')
            .find((line) => line.includes('• base'));
        expect(baseLine).toBeDefined();
        expect(baseLine?.match(/0\.0 pts/g)).toHaveLength(3);
        const riskLine = stdout
            .split('\n')
            .find((line) => line.includes('• risk'));
        expect(riskLine?.match(/ pts/g)).toHaveLength(3);
    });
});

describe('prop bankroll curve (PT-80)', () => {
    it('prices a row per budget with expected spend rising by one attempt cost per added attempt', () => {
        const out = simulate(
            TradingInputs.parse(
                parseArgs<typeof curveArguments>(SMALL_SIM, curveArguments),
            ).toSimInputs(rapidEodPlan()),
        );
        const cost = out.costPerAttempt;
        const budgets = [cost * 5, cost * 10, cost * 20].map((budget) =>
            dollars(budget),
        );
        const rows = curveRows(out, budgets, 3);
        expect(rows.map((row) => row[1])).toStrictEqual(['5', '10', '20']);
        expect(rows.map((row) => row[2])).toStrictEqual(
            [5, 10, 20].map((attempts) => formatCurrency(attempts * cost)),
        );
        const meanPayout =
            out.netValues.reduce((sum, net) => sum + net, 0) /
                out.netValues.length +
            cost;
        expect(rows.map((row) => row[3])).toStrictEqual(
            [5, 10, 20].map((attempts) =>
                formatCurrency(attempts * meanPayout),
            ),
        );
    });

    it('prints the curve table for --budgets', async () => {
        const argv = [...SMALL_SIM, '--budgets', '5000,10000,20000'];
        const { stdout } = await capturedFailure(
            curveCommand,
            parseArgs<typeof curveArguments>(argv, curveArguments),
            argv,
        );
        expect(stdout).toContain('expected spend');
        expect(stdout).toContain('expected payouts');
        expect(stdout).toContain('P(net < 0)');
        for (const budget of ['$5,000', '$10,000', '$20,000']) {
            expect(stdout).toContain(budget);
        }
    });
});

describe('prop bankroll project month ends and round budget (PT-80)', () => {
    const THREE_MONTHS = [
        ...SMALL_SIM,
        '--horizon-days',
        '63',
        '--trials',
        '30',
    ];

    function timelineFor(extra: string[]) {
        const argv = [...THREE_MONTHS, '--start', '5000', ...extra];
        const inputs = TradingInputs.parse(
            parseArgs<typeof projectArguments>(argv, projectArguments),
        );
        return simulateBankrollTimeline(
            toBankrollTimelineInputs(
                inputs,
                rapidEodPlan(),
                {
                    maxConcurrentAccounts: null,
                    monthlyBudget: null,
                    payoutLagDays: 0,
                    reinvestFraction: fraction(1),
                    roundBudget: null,
                    startingBankroll: dollars(5000),
                },
                63,
                30,
            ),
        );
    }

    it('gives a row per trading month whose last row equals the final-day figures', () => {
        const out = timelineFor([]);
        const cells = projectMonthEndCells(out);
        expect(cells).toHaveLength(3);
        expect(cells.map((row) => row[1])).toStrictEqual(['21', '42', '63']);
        const lastIndex = out.days.length - 1;
        const last = cells.at(-1);
        expect(last?.slice(2, 5)).toStrictEqual([
            formatCurrency(out.cashP10[lastIndex] ?? 0),
            formatCurrency(out.cashP50[lastIndex] ?? 0),
            formatCurrency(out.cashP90[lastIndex] ?? 0),
        ]);
        const summary = projectSummaryRows(out).find(
            ([label]) => label === 'bankroll (P10 / P50 / P90)',
        );
        expect(summary?.[1]).toBe(last?.slice(2, 5).join(' / '));
    });

    it('prints the month-end table', async () => {
        const stdout = await plainRun(
            projectCommand,
            parseArgs<typeof projectArguments>(
                [...THREE_MONTHS, '--start', '5000'],
                projectArguments,
            ),
            THREE_MONTHS,
        );
        expect(stdout).toContain('month ends');
        expect(stdout).toContain('bankroll P10');
        expect(
            stdout
                .split('\n')
                .filter((line) => /•\s+[123]\s+(21|42|63)\s/.test(line)),
        ).toHaveLength(3);
    });

    it('never spends more than the round budget and spends less than the same run without it', async () => {
        const open = await plainRun(
            projectCommand,
            parseArgs<typeof projectArguments>(
                [...THREE_MONTHS, '--start', '50000'],
                projectArguments,
            ),
            THREE_MONTHS,
        );
        const capped = await plainRun(
            projectCommand,
            parseArgs<typeof projectArguments>(
                [...THREE_MONTHS, '--start', '50000', '--round-budget', '1000'],
                projectArguments,
            ),
            THREE_MONTHS,
        );
        const openSpend = moneyAfter(open, 'cumulative spend (P90)');
        const cappedSpend = moneyAfter(capped, 'cumulative spend (P90)');
        expect(openSpend).toBeGreaterThan(1000);
        expect(cappedSpend).toBeLessThanOrEqual(1000);
        expect(cappedSpend).toBeLessThan(openSpend);
        expect(capped).toContain('round budget $1,000');
        expect(open).toContain('round budget none');
    });

    it('names the multiple and the cycle the closed-form line assumed', () => {
        const line = closedFormIllustration({
            horizonDays: 60,
            reinvest: fraction(0.5),
            start: dollars(5000),
        });
        expect(line).toContain('1.50x / 21-day illustrative cycle');
        expect(line).toContain('multiple = 1 + the reinvest fraction');
        expect(line).toContain('one trading month');
    });
});

describe('prop bankroll compare per-cycle multiple, bands and round budget (PT-80)', () => {
    const COMPARE = [...SMALL_SIM, '--horizon-days', '40', '--risks', '250'];

    it('prints each risk with its per-cycle multiple and P10 to P90 band', async () => {
        const stdout = await plainRun(
            compareCommand,
            parseArgs<typeof compareArguments>(
                [...COMPARE, '--start', '5000'],
                compareArguments,
            ),
            COMPARE,
        );
        expect(stdout).toContain('multiple/cycle');
        expect(stdout).toContain('P10 to P90 band');
        const rows = stdout
            .split('\n')
            .filter((line) => /•\s+250\s/.test(line));
        expect(rows).toHaveLength(1);
        for (const row of rows) {
            expect(row).toMatch(/\$-?[\d,]+ to \$-?[\d,]+/);
        }
    });

    it('states the multiples and cycle days the closed-form comparison assumed', async () => {
        const argv = [
            ...SMALL_SIM,
            '--start',
            '5000',
            '--horizon-days',
            '60',
            '--multiples',
            '5@60,3@30',
        ];
        const stdout = await plainRun(
            compareCommand,
            parseArgs<typeof compareArguments>(argv, compareArguments),
            argv,
        );
        expect(stdout).toContain(
            'assumed: 5.00x every 60 days, 3.00x every 30 days',
        );
    });

    it('accepts --round-budget and applies it to the compare timeline', async () => {
        const open = await plainRun(
            compareCommand,
            parseArgs<typeof compareArguments>(
                [...COMPARE, '--start', '50000'],
                compareArguments,
            ),
            COMPARE,
        );
        const capped = await plainRun(
            compareCommand,
            parseArgs<typeof compareArguments>(
                [...COMPARE, '--start', '50000', '--round-budget', '1000'],
                compareArguments,
            ),
            COMPARE,
        );
        expect(capped).not.toBe(open);
        expect(await acceptedFlags(compareCommand)).toContain('round-budget');
        expect(await acceptedFlags(projectCommand)).toContain('round-budget');
    });
});
