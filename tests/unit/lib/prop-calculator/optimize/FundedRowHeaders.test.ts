import { parseArgs } from 'citty';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import optimizeFunded from '~/cli/commands/prop/optimize/funded/command';
import { findFirm, FirmId, simulate } from '~/lib/prop-calculator';
import {
    FUNDED_ROW_HEADERS,
    fundedRowCells,
} from '~/lib/prop-calculator/optimize';

const SOURCE_ROOT = path.join(process.cwd(), 'src');

const SCANNED_FOLDERS = [
    path.join('app', '(app)', 'prop-calculator'),
    'cli',
    path.join('lib', 'prop-calculator'),
];

const HEADER_COPIES = [
    /label:\s*'(?:funded policy|horizon credit|monthly ex-credit|survivors)'/u,
    /'horizon credit',\s*'monthly net'/u,
];

async function filesMatching(patterns: readonly RegExp[]): Promise<string[]> {
    const folders = await Promise.all(
        SCANNED_FOLDERS.map((folder) =>
            readdir(path.join(SOURCE_ROOT, folder), {
                recursive: true,
                withFileTypes: true,
            }),
        ),
    );
    const files = folders
        .flat()
        .filter((entry) => entry.isFile() && /\.tsx?$/u.test(entry.name))
        .map((entry) => path.join(entry.parentPath, entry.name));
    const matching = await Promise.all(
        files.map(async (file) => {
            const text = await readFile(file, 'utf8');
            return patterns.some((pattern) => pattern.test(text))
                ? path.relative(SOURCE_ROOT, file)
                : null;
        }),
    );
    return matching.filter((file) => file !== null);
}

async function printedCliHeader(): Promise<string> {
    const argv = [
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
        '--flat',
        '200',
        '--percent',
        '',
    ];
    const resolvable = optimizeFunded.args;
    if (!resolvable) throw new Error('optimize funded command has no args');
    const resolved =
        typeof resolvable === 'function' ? resolvable() : resolvable;
    const written: string[] = [];
    const write = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation((chunk: string | Uint8Array) => {
            written.push(String(chunk));
            return true;
        });
    try {
        await optimizeFunded.run?.({
            args: parseArgs(argv, await resolved) as never,
            cmd: optimizeFunded,
            rawArgs: argv,
        });
    } finally {
        write.mockRestore();
    }
    const header = written
        .join('')
        .split('\n')
        .find((line) => line.includes('funded policy'));
    if (header === undefined) throw new Error('no table header was printed');
    return header;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('FUNDED_ROW_HEADERS is the one header list of the funded sweep table (F-27 (8))', () => {
    it('names the seven columns fundedRowCells fills, in the printed order', () => {
        expect(FUNDED_ROW_HEADERS).toStrictEqual([
            'funded policy',
            'per-cycle net',
            'horizon credit',
            'monthly net',
            'monthly ex-credit',
            'bust when funded',
            'survivors',
        ]);
        const plan = findFirm(FirmId.Mffu)?.plans[0];
        if (plan === undefined) throw new Error('expected an MFFU plan');
        const out = simulate({
            fundedHorizonDays: 5,
            maxEvalDays: 5,
            plan,
            riskPerTrade: 250,
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 4,
            trials: 5,
            winrate: 0.5,
        });
        expect(fundedRowCells('flat $200', out, 5)).toHaveLength(
            FUNDED_ROW_HEADERS.length,
        );
    });

    it('is what the CLI prints as its table header', async () => {
        const header = await printedCliHeader();
        expect(header.trim().split(/\s{2,}/u)).toStrictEqual([
            ...FUNDED_ROW_HEADERS,
        ]);
    });

    it('has no second copy of the header strings in src', async () => {
        expect(await filesMatching(HEADER_COPIES)).toStrictEqual([
            path.join(
                'lib',
                'prop-calculator',
                'optimize',
                'FundedCandidateText.ts',
            ),
        ]);
    });
});
