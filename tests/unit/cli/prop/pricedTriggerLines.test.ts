import { type ArgsDef, type CommandDef, parseArgs } from 'citty';
import { afterEach, describe, expect, it, vi } from 'vitest';

import batchCommand, {
    batchArguments,
} from '~/cli/commands/prop/bankroll/batch';
import leversCommand, {
    leversArguments,
} from '~/cli/commands/prop/bankroll/levers';
import riskCommand, { riskArguments } from '~/cli/commands/prop/bankroll/risk';
import compareCommand from '~/cli/commands/prop/compare/command';
import optimizeFundedCommand from '~/cli/commands/prop/optimize/funded/command';
import { pricedTriggerLines, TradingInputs } from '~/cli/commands/prop/shared';
import simCommand, { simArguments } from '~/cli/commands/prop/sim/command';
import {
    CumulativeAmountTrigger,
    dollars,
    findFirm,
    FirmId,
    MffuVariant,
    PolicySourceKind,
    PolicyVerification,
} from '~/lib/prop-calculator';
import { assumptionText } from '~/lib/prop-calculator/advisor';
import { pricedCumulativeTriggerAssumptionOf } from '~/lib/prop-calculator/advisor/policy';
import {
    LIVE_TRANSFER_CONCLUDING_PAYOUT_TEXT,
    LIVE_TRANSFER_CONTINUATION_TEXT,
    LiveTransferContinuationKind,
    liveTransferContinuationNotes,
} from '~/lib/prop-calculator/simulator';

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

const URL = 'https://example.invalid/rule';

async function capturedRun(
    command: CommandDef<never>,
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

async function compareArguments(): Promise<ArgsDef> {
    return resolvedArguments(compareCommand.args, 'compare');
}

function expectsHazardAndTriggerOnce(stdout: string) {
    expect(occurrences(stdout, TRIGGER_HEADING)).toBe(1);
    expect(occurrences(stdout, URL)).toBe(1);
    expect(occurrences(stdout, HAZARD_HEADING)).toBe(1);
    expect(occurrences(stdout, LIVE_TRANSFER_CONCLUDING_PAYOUT_TEXT)).toBe(1);
    expect(occurrences(stdout, MODELED_CONTINUATION)).toBe(1);
    const notes = planNotes();
    expect(notes.length).toBeGreaterThan(0);
    for (const note of notes) {
        expect(occurrences(stdout, note)).toBe(1);
    }
}

function expectsTriggerLine(stdout: string) {
    const assumption = pricedCumulativeTriggerAssumptionOf({
        instrument: undefined,
        plan: mffuPlan(),
        stopPoints: undefined,
        verifiedCumulativePayoutTrigger: 1500,
    });
    if (assumption === undefined) throw new Error('expected a priced trigger');
    expect(stdout).toContain(assumptionText(assumption));
    expect(stdout).toContain(URL);
}

async function fundedArguments(): Promise<ArgsDef> {
    return resolvedArguments(optimizeFundedCommand.args, 'optimize funded');
}

function mffuPlan() {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

function occurrences(text: string, part: string): number {
    return text.split(part).length - 1;
}

function planNotes(): readonly string[] {
    return liveTransferContinuationNotes(
        mffuPlan(),
        LiveTransferContinuationKind.Modeled,
    );
}

async function resolvedArguments(
    resolvable: CommandDef['args'],
    name: string,
): Promise<ArgsDef> {
    if (!resolvable) throw new Error(`${name} command has no args`);
    const resolved =
        typeof resolvable === 'function' ? resolvable() : resolvable;
    return resolved instanceof Promise ? await resolved : resolved;
}

function stubTrigger() {
    const firm = findFirm(FirmId.Mffu);
    if (!firm) throw new Error('MFFU not registered');
    vi.spyOn(firm.accountPolicy, 'liveTriggersFor').mockReturnValue([
        new CumulativeAmountTrigger(dollars(1500), {
            fetchedOn: '2026-09-26',
            quote: 'quote',
            sourceKind: PolicySourceKind.LiveFetch,
            url: URL,
            verification: PolicyVerification.Confirmed,
        }),
    ]);
}

const NO_TRIGGER_TEXT = 'confirmed trigger';
const TRIGGER_HEADING =
    'The simulation sends an account live once the payouts it receives';
const HAZARD = ['--live-transfer-hazard', '0.3', '--stop-points', '10'];
const HAZARD_HEADING = 'Live transfer: 30.0% per paid payout';
const MODELED_CONTINUATION =
    LIVE_TRANSFER_CONTINUATION_TEXT[LiveTransferContinuationKind.Modeled];
const NOT_MODELED_CONTINUATION =
    LIVE_TRANSFER_CONTINUATION_TEXT[LiveTransferContinuationKind.NotModeled];

describe('the CLI prints the one priced-trigger wording (PT-36r, F-145)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('builds the line from the typed assumption text, indented, and nothing without a trigger', () => {
        const plan = mffuPlan();
        const inputs = TradingInputs.parse(
            parseArgs<typeof batchArguments>(SMALL_SIM, batchArguments),
        );
        expect(pricedTriggerLines(inputs.toSimInputs(plan))).toStrictEqual([]);
        stubTrigger();
        const simInputs = inputs.toSimInputs(plan);
        const assumption = pricedCumulativeTriggerAssumptionOf(simInputs);
        if (assumption === undefined) throw new Error('expected a trigger');
        expect(pricedTriggerLines(simInputs)).toStrictEqual([
            `  ${assumptionText(assumption)}`,
        ]);
    });

    it('prints it under the heading of prop bankroll batch', async () => {
        stubTrigger();
        const stdout = await capturedRun(
            batchCommand as never,
            parseArgs<typeof batchArguments>(
                [...SMALL_SIM, '--attempts', '3'],
                batchArguments,
            ),
            SMALL_SIM,
        );
        expectsTriggerLine(stdout);
    });

    it('prints it under the heading of prop bankroll risk', async () => {
        stubTrigger();
        const stdout = await capturedRun(
            riskCommand as never,
            parseArgs<typeof riskArguments>(
                [...SMALL_SIM, '--budget', '5000'],
                riskArguments,
            ),
            SMALL_SIM,
        );
        expectsTriggerLine(stdout);
    });

    it('prints it under the heading of prop bankroll levers', async () => {
        stubTrigger();
        const stdout = await capturedRun(
            leversCommand as never,
            parseArgs<typeof leversArguments>(
                [...SMALL_SIM, '--bankroll', '5000'],
                leversArguments,
            ),
            SMALL_SIM,
        );
        expectsTriggerLine(stdout);
    });

    it('prints it for each ranked plan that prices one in prop compare', async () => {
        stubTrigger();
        const arguments_ = await compareArguments();
        const argv = [...SMALL_SIM];
        const stdout = await capturedRun(
            compareCommand as never,
            parseArgs(argv, arguments_),
            argv,
        );
        expectsTriggerLine(stdout);
        expect(stdout).toContain('Rapid');
    });

    it('prints it above the split table in prop compare --splits', async () => {
        stubTrigger();
        const arguments_ = await compareArguments();
        const argv = [...SMALL_SIM, '--total-risk', '2000', '--splits', '1,2'];
        const stdout = await capturedRun(
            compareCommand as never,
            parseArgs(argv, arguments_),
            argv,
        );
        expectsTriggerLine(stdout);
    });

    it('prints it under the heading of prop sim in the same wording', async () => {
        stubTrigger();
        const stdout = await capturedRun(
            simCommand as never,
            parseArgs<typeof simArguments>(SMALL_SIM, simArguments),
            SMALL_SIM,
        );
        expectsTriggerLine(stdout);
        expect(stdout).not.toContain('verified firm trigger');
    });

    it('prints it under the heading of prop optimize funded in the same wording', async () => {
        stubTrigger();
        const argv = [...SMALL_SIM, '--flat', '150'];
        const stdout = await capturedRun(
            optimizeFundedCommand as never,
            parseArgs(argv, await fundedArguments()),
            argv,
        );
        expectsTriggerLine(stdout);
        expect(stdout).not.toContain('verified firm trigger');
    });

    it('states the continuation of the live transfer once in prop sim and prop optimize funded', async () => {
        stubTrigger();
        const simOut = await capturedRun(
            simCommand as never,
            parseArgs<typeof simArguments>(SMALL_SIM, simArguments),
            SMALL_SIM,
        );
        const argv = [...SMALL_SIM, '--flat', '150'];
        const fundedOut = await capturedRun(
            optimizeFundedCommand as never,
            parseArgs(argv, await fundedArguments()),
            argv,
        );
        for (const stdout of [simOut, fundedOut]) {
            expect(occurrences(stdout, NOT_MODELED_CONTINUATION)).toBe(1);
        }
    });

    it('states the continuation and the plan notes once in prop sim when a hazard and a priced trigger both apply', async () => {
        stubTrigger();
        const argv = [...SMALL_SIM, ...HAZARD];
        const stdout = await capturedRun(
            simCommand as never,
            parseArgs<typeof simArguments>(argv, simArguments),
            argv,
        );
        expectsHazardAndTriggerOnce(stdout);
    });

    it('states the continuation and the plan notes once in prop optimize funded when a hazard and a priced trigger both apply', async () => {
        stubTrigger();
        const argv = [...SMALL_SIM, '--flat', '150', ...HAZARD];
        const stdout = await capturedRun(
            optimizeFundedCommand as never,
            parseArgs(argv, await fundedArguments()),
            argv,
        );
        expectsHazardAndTriggerOnce(stdout);
    });

    it('still states the continuation and the notes in the hazard lines when no trigger is priced', async () => {
        const argv = [...SMALL_SIM, ...HAZARD];
        const stdout = await capturedRun(
            simCommand as never,
            parseArgs<typeof simArguments>(argv, simArguments),
            argv,
        );
        expect(occurrences(stdout, MODELED_CONTINUATION)).toBe(1);
        expect(occurrences(stdout, HAZARD_HEADING)).toBe(1);
        for (const note of planNotes()) {
            expect(occurrences(stdout, note)).toBe(1);
        }
    });

    it('prints nothing about a trigger in prop sim or prop optimize funded when the firm has none confirmed', async () => {
        const simOut = await capturedRun(
            simCommand as never,
            parseArgs<typeof simArguments>(SMALL_SIM, simArguments),
            SMALL_SIM,
        );
        expect(simOut).not.toContain(NO_TRIGGER_TEXT);
        const argv = [...SMALL_SIM, '--flat', '150'];
        const fundedOut = await capturedRun(
            optimizeFundedCommand as never,
            parseArgs(argv, await fundedArguments()),
            argv,
        );
        expect(fundedOut).not.toContain(NO_TRIGGER_TEXT);
    });

    it('prints nothing about a trigger when the firm has none confirmed', async () => {
        const stdout = await capturedRun(
            batchCommand as never,
            parseArgs<typeof batchArguments>(
                [...SMALL_SIM, '--attempts', '3'],
                batchArguments,
            ),
            SMALL_SIM,
        );
        expect(stdout).not.toContain(NO_TRIGGER_TEXT);
    });
});
