import { parseArgs } from 'citty';
import { describe, expect, it, vi } from 'vitest';

import advise, { adviseArguments } from '~/cli/commands/prop/advise/command';
import { AdviceSource } from '~/lib/prop-calculator/advisor';

const FUNDED_APEX_EOD = [
    '--firm',
    'apex',
    '--variant',
    'eod',
    '--stage',
    'funded',
    '--balance',
    '52000',
    '--highest-eod',
    '52000',
    '--payouts',
    '0',
    '--trials',
    '10',
    '--seed',
    '3',
    '--json',
];

const WITH_HISTORY = ['--trading-days', '5'];
const WITHOUT_HISTORY = ['--trading-days', '0'];

interface JsonAdvice {
    readonly optima: readonly { readonly source: string }[];
    readonly requests: readonly { readonly source: string }[];
}

const JSON_CACHE = new Map<string, JsonAdvice>();

async function adviseJson(argv: readonly string[]): Promise<JsonAdvice> {
    const key = argv.join(' ');
    const cached = JSON_CACHE.get(key);
    if (cached !== undefined) return cached;
    const written: string[] = [];
    const previousExitCode = process.exitCode;
    const stdout = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation(recordInto(written));
    const stderr = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(recordInto(written));
    try {
        await advise.run?.({
            args: parseArgs<typeof adviseArguments>([...argv], adviseArguments),
            cmd: advise,
            rawArgs: [...argv],
        });
    } finally {
        stdout.mockRestore();
        stderr.mockRestore();
        process.exitCode = previousExitCode;
    }
    const advice = JSON.parse(written.join('')) as JsonAdvice;
    JSON_CACHE.set(key, advice);
    return advice;
}

function bySource(a: string, b: string): number {
    return a.localeCompare(b);
}

function recordInto(written: string[]) {
    return (chunk: string | Uint8Array): boolean => {
        written.push(String(chunk));
        return true;
    };
}

describe('prop advise --json carries the engine sources of a funded advice (PT-109 step 8, F-133 (2))', () => {
    it('with history, lists the fresh sweep, the from-state sweep, the payout-size sweep and the next payout projection as results', async () => {
        const advice = await adviseJson([...FUNDED_APEX_EOD, ...WITH_HISTORY]);

        expect(
            advice.optima.map((result) => result.source).toSorted(bySource),
        ).toStrictEqual(
            [
                AdviceSource.FundedSweepFresh,
                AdviceSource.FundedSweepFromState,
                AdviceSource.NextPayoutProjection,
                AdviceSource.PayoutSizeSweep,
            ].toSorted(bySource),
        );
    }, 10_000);

    it('without history, has no from-state sweep', async () => {
        const advice = await adviseJson([
            ...FUNDED_APEX_EOD,
            ...WITHOUT_HISTORY,
        ]);

        const sources = advice.optima.map((result) => result.source);
        expect(sources).toContain(AdviceSource.FundedSweepFresh);
        expect(sources).toContain(AdviceSource.PayoutSizeSweep);
        expect(sources).toContain(AdviceSource.NextPayoutProjection);
        expect(sources).not.toContain(AdviceSource.FundedSweepFromState);
    }, 10_000);

    it('requests exactly the sources it returns results for', async () => {
        const advice = await adviseJson([...FUNDED_APEX_EOD, ...WITH_HISTORY]);

        expect(
            advice.requests.map((request) => request.source).toSorted(bySource),
        ).toStrictEqual(
            advice.optima.map((result) => result.source).toSorted(bySource),
        );
    });
});
