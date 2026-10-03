import { type ArgsDef, parseArgs } from 'citty';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import optimizeFunded from '~/cli/commands/prop/optimize/funded/command';
import {
    liveTransferRunLines,
    liveTransferSweepLines,
} from '~/cli/commands/prop/shared';
import simCommand, { simArguments } from '~/cli/commands/prop/sim/command';
import { LiveApplicabilityNote } from '~/lib/prop-calculator/firms';
import {
    LIVE_TRANSFER_CONTINUATION_TEXT,
    LIVE_TRANSFER_NOTE_TEXT,
    LIVE_TRANSFER_UNFOLLOWED_SETTINGS_TEXT,
    LiveTransferContinuationKind,
} from '~/lib/prop-calculator/simulator';

const FLEX_NOTE =
    LIVE_TRANSFER_NOTE_TEXT[
        LiveApplicabilityNote.FundedNextFlexTriggerConflict
    ];

const RAPID_EOD_NOTE =
    LIVE_TRANSFER_NOTE_TEXT[
        LiveApplicabilityNote.MffuRapidEodLiveContractLimitDisputed
    ];

const FLEX_SIM = [
    '--firm',
    'fundednext',
    '--variant',
    'flex',
    '--trials',
    '40',
    '--eval-days',
    '20',
    '--funded-days',
    '20',
    '--live-transfer-hazard',
    '0.3',
];

const RAPID_EOD_SIM = [
    '--firm',
    'mffu',
    '--variant',
    'rapid-eod',
    '--trials',
    '40',
    '--eval-days',
    '20',
    '--funded-days',
    '20',
    '--live-transfer-hazard',
    '0.3',
];

const FLEX_FUNDED_SWEEP = [
    '--firm',
    'fundednext',
    '--variant',
    'flex',
    '--trials',
    '40',
    '--eval-days',
    '20',
    '--funded-days',
    '20',
    '--winrate',
    '0.6',
    '--flat',
    '150',
    '--percent',
    '',
    '--live-transfer-hazard',
    '0.3',
];

async function capturedOptimizeFundedRun(argv: string[]): Promise<string> {
    const resolvable = optimizeFunded.args;
    if (!resolvable) throw new Error('optimize funded command has no args');
    const definition: ArgsDef = await (typeof resolvable === 'function'
        ? resolvable()
        : resolvable);
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
        await optimizeFunded.run?.({
            args: parseArgs(argv, definition) as never,
            cmd: optimizeFunded,
            rawArgs: argv,
        });
    } finally {
        write.mockRestore();
        writeError.mockRestore();
        process.exitCode = exitCode;
    }
    return written.join('');
}

async function capturedSimRun(argv: string[]): Promise<string> {
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
        await simCommand.run?.({
            args: parseArgs<typeof simArguments>(argv, simArguments),
            cmd: simCommand,
            rawArgs: argv,
        });
    } finally {
        write.mockRestore();
        writeError.mockRestore();
        process.exitCode = exitCode;
    }
    return written.join('');
}

describe('prop sim names the live-continuation notes beside the hazard (PT-73f)', () => {
    it('prints the FundedNext Flex trigger-conflict note beside the $0 continuation', async () => {
        const stdout = await capturedSimRun(FLEX_SIM);
        expect(stdout).toContain('Live transfer: 30.0% per paid payout');
        expect(stdout).toContain(
            LIVE_TRANSFER_CONTINUATION_TEXT[
                LiveTransferContinuationKind.NotModeled
            ],
        );
        expect(stdout).toContain(FLEX_NOTE);
    });

    it('prints the unfollowed-settings note and the plan note when a live plan is modeled', async () => {
        const stdout = await capturedSimRun([
            ...RAPID_EOD_SIM,
            '--stop-points',
            '10',
        ]);
        expect(stdout).toContain(LIVE_TRANSFER_UNFOLLOWED_SETTINGS_TEXT);
        expect(stdout).toContain(RAPID_EOD_NOTE);
    });

    it('prints no continuation note without a hazard', async () => {
        const stdout = await capturedSimRun(
            FLEX_SIM.slice(0, FLEX_SIM.indexOf('--live-transfer-hazard')),
        );
        expect(stdout).not.toContain(FLEX_NOTE);
    });
});

describe('prop optimize funded names the live-continuation notes beside the hazard (PT-73f)', () => {
    it('prints the FundedNext Flex trigger-conflict note beside the $0 continuation', async () => {
        const stdout = await capturedOptimizeFundedRun(FLEX_FUNDED_SWEEP);
        expect(stdout).toContain('Live transfer: 30.0% per paid payout');
        expect(stdout).toContain(
            LIVE_TRANSFER_CONTINUATION_TEXT[
                LiveTransferContinuationKind.NotModeled
            ],
        );
        expect(stdout).toContain(FLEX_NOTE);
    });
});

describe('the CLI hazard line builders require their notes (PT-73f)', () => {
    it('takes the notes as a required argument', () => {
        expectTypeOf(liveTransferRunLines)
            .parameter(2)
            .toEqualTypeOf<readonly string[]>();
        expectTypeOf(liveTransferSweepLines)
            .parameter(2)
            .toEqualTypeOf<readonly string[]>();
    });
});
