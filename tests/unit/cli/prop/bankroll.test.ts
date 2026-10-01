import { type CommandDef, parseArgs } from 'citty';
import { describe, expect, it, vi } from 'vitest';

import { toBankrollTimelineInputs } from '~/cli/commands/prop/bankroll/bankrollFlags';
import batchCommand, {
    batchArguments,
} from '~/cli/commands/prop/bankroll/batch';
import compareCommand, {
    compareArguments,
} from '~/cli/commands/prop/bankroll/compare';
import bankrollGroup from '~/cli/commands/prop/bankroll/group';
import leversCommand, {
    leversArguments,
    leverVariants,
} from '~/cli/commands/prop/bankroll/levers';
import projectCommand, {
    closedFormIllustration,
    projectArguments,
} from '~/cli/commands/prop/bankroll/project';
import riskCommand, {
    riskArguments,
    riskRows,
} from '~/cli/commands/prop/bankroll/risk';
import {
    edgePlausibilityNote,
    TradingInputs,
} from '~/cli/commands/prop/shared';
import {
    findFirm,
    FirmId,
    fraction,
    MffuVariant,
    simulate,
} from '~/lib/prop-calculator';
import { BankrollLeverKind } from '~/lib/prop-calculator/economics';

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

function rapidEodPlan() {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

describe('prop bankroll group wires all five subcommands', () => {
    it('lazily resolves batch, compare, levers, project and risk', async () => {
        const subCommands = bankrollGroup.subCommands ?? {};
        const names = Object.keys(subCommands).toSorted((a, b) =>
            a.localeCompare(b),
        );
        expect(names).toStrictEqual([
            'batch',
            'compare',
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
                    '--funded-risk',
                    '1000',
                ],
                projectArguments,
            ),
            SMALL_SIM,
        );
        expect(stdout).toContain(
            edgePlausibilityNote({ rrRatio: 1, winrate: fraction(0.7) }) ??
                'missing note',
        );
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
                    '--funded-risk',
                    '1000',
                ],
                compareArguments,
            ),
            SMALL_SIM,
        );
        expect(stdout).toContain(
            edgePlausibilityNote({ rrRatio: 1, winrate: fraction(0.7) }) ??
                'missing note',
        );
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
            edgePlausibilityNote({ rrRatio: 1, winrate: fraction(0.7) }) ??
                'missing note',
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
