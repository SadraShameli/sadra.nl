import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { dollars } from '~/lib/prop-calculator/core';
import {
    type BatchLossPricing,
    BatchLossStatus,
    hasPositiveEvPerAttempt,
    priceBatchLoss,
    rankRuinFirst,
    RUIN_FIRST_FALLBACK_NOTE,
    RUIN_FIRST_NEEDS_BANKROLL_NOTE,
    RUIN_FIRST_NO_ATTEMPT_NOTE,
    RUIN_FIRST_NO_POSITIVE_EV_NOTE,
    RUIN_FIRST_UNPRICED_NOTE,
    RuinFirstFallback,
    type RuinFirstRankable,
} from '~/lib/prop-calculator/economics';

interface FixtureRow extends RuinFirstRankable {
    readonly id: string;
    readonly loss: BatchLossPricing;
}

const SRC = path.join(process.cwd(), 'src');
const BANKROLL = dollars(5000);
const NO_ATTEMPT: BatchLossPricing = { status: BatchLossStatus.NoAttempt };
const UNPRICED: BatchLossPricing = { status: BatchLossStatus.Unpriced };

function ids(rows: readonly FixtureRow[]): string[] {
    return rows.map((candidate) => candidate.id);
}

function priced(probability: number): BatchLossPricing {
    return { probability, status: BatchLossStatus.Priced };
}

function rank(rows: readonly FixtureRow[], bankroll = BANKROLL) {
    return rankRuinFirst(rows, {
        bankroll,
        batchLoss: (candidate) => candidate.loss,
    });
}

function row(
    id: string,
    monthly: number,
    evPerAttempt: number,
    loss: BatchLossPricing,
): FixtureRow {
    return {
        id,
        loss,
        out: {
            expectedMonthlyNet: monthly,
            expectedNetPerAttempt: evPerAttempt,
        },
    };
}

const DEFINITION_FILE = path.join(
    'src',
    'lib',
    'prop-calculator',
    'economics',
    'RuinFirstRanking.ts',
);

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
        .map((entry) => path.join(entry.parentPath, entry.name));
}

describe('rankRuinFirst orders positive EV plans by lower batch loss, then monthly net', () => {
    it('puts positive EV plans first by lower loss, an unpriced one after the priced, then the rest by monthly net', () => {
        const ranked = rank([
            row('risky', 500, 1, priced(0.4)),
            row('safe', 100, 1, priced(0.1)),
            row('unpriced', 900, 1, UNPRICED),
            row('negative-big', 800, -1, priced(0.01)),
            row('negative-small', 50, -1, priced(0.01)),
        ]);
        expect(ids(ranked.rows)).toStrictEqual([
            'safe',
            'risky',
            'unpriced',
            'negative-big',
            'negative-small',
        ]);
        expect(ranked.fallback).toBeNull();
        expect(ranked.note).toBeNull();
    });

    it('breaks a loss tie by higher monthly net', () => {
        const ranked = rank([
            row('tie low', 200, 1, priced(0.25)),
            row('tie high', 500, 1, priced(0.25)),
        ]);
        expect(ids(ranked.rows)).toStrictEqual(['tie high', 'tie low']);
    });

    it('treats an EV per attempt of exactly zero as not positive', () => {
        const ranked = rank([
            row('zero', 800, 0, priced(0.02)),
            row('positive', 100, 1, priced(0.9)),
        ]);
        expect(ids(ranked.rows)).toStrictEqual(['positive', 'zero']);
        expect(hasPositiveEvPerAttempt({ expectedNetPerAttempt: 0 })).toBe(
            false,
        );
        expect(hasPositiveEvPerAttempt({ expectedNetPerAttempt: 0.01 })).toBe(
            true,
        );
    });

    it('does not reorder the input and keeps equal rows in input order', () => {
        const rows = [
            row('x', 100, 1, priced(0.1)),
            row('y', 100, 1, priced(0.1)),
        ];
        const copy = [...rows];
        expect(ids(rank(rows).rows)).toStrictEqual(['x', 'y']);
        expect(rows).toStrictEqual(copy);
    });

    it('prices only plans with EV per attempt above zero', () => {
        const batchLoss = vi.fn(
            (candidate: FixtureRow): BatchLossPricing => candidate.loss,
        );
        rankRuinFirst(
            [
                row('positive', 100, 1, priced(0.1)),
                row('negative', 900, -1, priced(0.1)),
            ],
            { bankroll: BANKROLL, batchLoss },
        );
        expect(batchLoss).toHaveBeenCalledTimes(1);
        expect(batchLoss.mock.calls[0]?.[0].id).toBe('positive');
    });
});

describe('rankRuinFirst falls back to monthly net with a typed reason', () => {
    const rows = [
        row('a', 100, 1, priced(0.1)),
        row('b', 300, 1, priced(0.2)),
        row('c', 200, 1, priced(0.3)),
    ];

    it.each([null, dollars(0), dollars(-1)])(
        'needs a bankroll when it is %j, and never prices a loss',
        (bankroll) => {
            const batchLoss = vi.fn((): BatchLossPricing => priced(0.1));
            const ranked = rankRuinFirst(rows, { bankroll, batchLoss });
            expect(ranked.fallback).toBe(RuinFirstFallback.NeedsBankroll);
            expect(ranked.note).toBe(RUIN_FIRST_NEEDS_BANKROLL_NOTE);
            expect(ids(ranked.rows)).toStrictEqual(['b', 'c', 'a']);
            expect(batchLoss).not.toHaveBeenCalled();
        },
    );

    it('says no plan has EV per attempt above zero, and keeps every row on monthly net', () => {
        const ranked = rank([
            row('a', 100, -1, priced(0.5)),
            row('b', 300, 0, priced(0.5)),
        ]);
        expect(ranked.fallback).toBe(RuinFirstFallback.NoPositiveEv);
        expect(ranked.note).toBe(RUIN_FIRST_NO_POSITIVE_EV_NOTE);
        expect(ids(ranked.rows)).toStrictEqual(['b', 'a']);
    });

    it('says no attempt is affordable when no positive EV plan has a price and none was too large', () => {
        const ranked = rank([
            row('a', 100, 1, NO_ATTEMPT),
            row('b', 300, 1, NO_ATTEMPT),
        ]);
        expect(ranked.fallback).toBe(RuinFirstFallback.NoAttempt);
        expect(ranked.note).toBe(RUIN_FIRST_NO_ATTEMPT_NOTE);
        expect(ids(ranked.rows)).toStrictEqual(['b', 'a']);
    });

    it('says the risk could not be priced, not that no attempt is affordable, when a batch is too large to simulate', () => {
        const ranked = rank([
            row('a', 100, 1, UNPRICED),
            row('b', 300, 1, NO_ATTEMPT),
        ]);
        expect(ranked.fallback).toBe(RuinFirstFallback.Unpriced);
        expect(ranked.note).toBe(RUIN_FIRST_UNPRICED_NOTE);
        expect(ranked.note).not.toBe(RUIN_FIRST_NO_ATTEMPT_NOTE);
        expect(ids(ranked.rows)).toStrictEqual(['b', 'a']);
    });

    it('has a distinct note per fallback, with no em dash and no hyphenated ruin-first', () => {
        const notes = Object.values(RuinFirstFallback).map(
            (fallback) => RUIN_FIRST_FALLBACK_NOTE[fallback],
        );
        expect(new Set(notes).size).toBe(
            Object.values(RuinFirstFallback).length,
        );
        for (const note of notes) {
            expect(note).not.toContain('\u{2014}');
            expect(note).not.toContain('ruin-first');
        }
    });
});

describe('priceBatchLoss separates no affordable attempt from a batch too large to price', () => {
    const base = {
        attemptPaysProbability: 0.5,
        costPerAttempt: 500,
        netValues: [-500, 1500],
    };
    const SEED = 7;

    it('prices a small affordable batch', () => {
        const pricing = priceBatchLoss(base, dollars(1000), SEED);
        expect(pricing.status).toBe(BatchLossStatus.Priced);
        if (pricing.status !== BatchLossStatus.Priced) return;
        expect(pricing.probability).toBeGreaterThan(0.2);
        expect(pricing.probability).toBeLessThan(0.3);
    });

    it('reports no attempt when the bankroll is below one attempt cost', () => {
        expect(priceBatchLoss(base, dollars(499.99), SEED).status).toBe(
            BatchLossStatus.NoAttempt,
        );
    });

    it('reports unpriced, not no attempt, when the bankroll affords more attempts than a batch can simulate', () => {
        const cheap = { ...base, costPerAttempt: 1 };
        expect(priceBatchLoss(cheap, dollars(50_000_000), SEED).status).toBe(
            BatchLossStatus.Unpriced,
        );
    });

    it('still prices a bankroll that affords a thousand attempts', () => {
        const cheap = { ...base, costPerAttempt: 10 };
        expect(priceBatchLoss(cheap, dollars(10_000), SEED).status).toBe(
            BatchLossStatus.Priced,
        );
    });

    it('prices the same row identically on the same seed', () => {
        expect(priceBatchLoss(base, dollars(1000), SEED)).toStrictEqual(
            priceBatchLoss(base, dollars(1000), SEED),
        );
    });
});

describe('the ruin-first ordering has one definition in src', () => {
    const NEEDLES = [
        RUIN_FIRST_NEEDS_BANKROLL_NOTE,
        RUIN_FIRST_NO_ATTEMPT_NOTE,
        RUIN_FIRST_NO_POSITIVE_EV_NOTE,
        RUIN_FIRST_UNPRICED_NOTE,
        'function rankRuinFirst',
        'function priceBatchLoss',
        'enum BatchLossStatus',
        'expectedNetPerAttempt > 0',
    ];
    const filesByNeedle = new Map<string, string[]>();

    beforeAll(async () => {
        for (const needle of NEEDLES) filesByNeedle.set(needle, []);
        const texts = await Promise.all(
            sourceFiles(SRC).map(async (file) => ({
                file,
                text: await readFile(file, 'utf8'),
            })),
        );
        for (const { file, text } of texts) {
            for (const needle of NEEDLES) {
                if (text.includes(needle)) {
                    filesByNeedle
                        .get(needle)
                        ?.push(path.relative(process.cwd(), file));
                }
            }
        }
    }, 10_000);

    it.each(NEEDLES)('writes %j in one file', (needle) => {
        expect(filesByNeedle.get(needle)).toStrictEqual([DEFINITION_FILE]);
    });
});
