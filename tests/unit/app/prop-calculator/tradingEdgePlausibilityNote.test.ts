import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    compoundStartDollarsOf,
    tradingEdgePlausibilityNote,
} from '~/app/(app)/prop-calculator/_components/TradingInputs';
import { formatCurrency } from '~/lib/format';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import { fraction, TRADING_DAYS_PER_MONTH } from '~/lib/prop-calculator/core';
import {
    compoundedMultiple,
    kellyGrowthPerTrade,
} from '~/lib/prop-calculator/economics';

const COMPONENTS_ROOT = path.join(
    process.cwd(),
    'src',
    'app',
    '(app)',
    'prop-calculator',
    '_components',
);

function componentSource(fileName: string): string {
    return readFileSync(path.join(COMPONENTS_ROOT, fileName), 'utf8');
}

describe('tradingEdgePlausibilityNote (F-V22)', () => {
    it('shows no note for the default 40% winrate at 1:2, a typical edge', () => {
        expect(
            tradingEdgePlausibilityNote(
                DEFAULT_RULEBOOK.strategy.winrate,
                DEFAULT_RULEBOOK.strategy.rr,
            ),
        ).toBeNull();
    });

    it('flags an implausible edge, naming the level, the R value and both entered inputs', () => {
        const note = tradingEdgePlausibilityNote(0.9, 2);
        expect(note).not.toBeNull();
        expect(note).toContain('Implausible edge');
        expect(note).toContain('90%');
        expect(note).toContain('1:2.00');
        expect(note).toContain('+1.70R');
    });

    it('flags a strong edge between the typical and strong thresholds', () => {
        const note = tradingEdgePlausibilityNote(0.5, 2, {
            strongMaxExpectancyR: 0.6,
            typicalMaxExpectancyR: 0.3,
        });
        expect(note).toContain('Strong edge');
    });

    it('flags a no-edge system at or below breakeven', () => {
        const note = tradingEdgePlausibilityNote(0.3, 1);
        expect(note).toContain('No edge');
    });

    it('names both expectancy sources while QV-20 is open', () => {
        const note = tradingEdgePlausibilityNote(0.9, 2);
        expect(note).toContain('QV-20');
        expect(note).toContain('+0.20R from 40% at 1:2');
        expect(note).toContain('+0.26R');
    });

    it('has no em dash', () => {
        const note = tradingEdgePlausibilityNote(0.9, 2);
        expect(note).not.toContain('—');
    });

    it('is what TradingInputs renders next to the reward-to-risk slider', () => {
        const source = componentSource('TradingInputs.tsx');
        const noteAt = source.indexOf("{plausibilityNote ?? ''}");
        const rrSliderAt = source.indexOf('id="rr-ratio-label"');
        const tradesPerDayAt = source.indexOf('id="trades-per-day"');
        expect(noteAt).toBeGreaterThan(rrSliderAt);
        expect(noteAt).toBeLessThan(tradesPerDayAt);
        expect(source).toContain('const plausibilityNote = ');
        expect(source).toContain('tradingEdgePlausibilityNote(');
    });
});

describe('tradingEdgePlausibilityNote Kelly growth and pace (F-V22, PT-86)', () => {
    const growth = kellyGrowthPerTrade(fraction(0.7), 1).value ?? NaN;
    const multiple =
        compoundedMultiple(growth, 4 * TRADING_DAYS_PER_MONTH).value ?? NaN;

    it('shows the growth per trade, labelled information, for a 70% edge at 1:1', () => {
        const note = tradingEdgePlausibilityNote(0.7, 1);
        expect(note).toContain(
            `${(Math.expm1(growth) * 100).toFixed(2)}% per trade`,
        );
        expect(note).toContain(
            'information, not sizing; Kelly is not prop-firm sizing',
        );
        expect(note).not.toContain('compounds to');
    });

    it('shows the one-month multiple at the entered trades per day', () => {
        const note = tradingEdgePlausibilityNote(
            0.7,
            1,
            DEFAULT_RULEBOOK.plausibility,
            { tradesPerDay: 4 },
        );
        expect(note).toContain('4 trades per day');
        expect(note).toContain(
            `compounds to ${multiple.toLocaleString('en-US', { maximumFractionDigits: 2 })}x`,
        );
    });

    it('shows the amount from a 5,000 start', () => {
        const note = tradingEdgePlausibilityNote(
            0.7,
            1,
            DEFAULT_RULEBOOK.plausibility,
            { compoundStartDollars: 5000, tradesPerDay: 4 },
        );
        expect(note).toContain(formatCurrency(5000 * multiple));
    });

    it('shows no note for a typical edge even with a pace and a start', () => {
        expect(
            tradingEdgePlausibilityNote(
                DEFAULT_RULEBOOK.strategy.winrate,
                DEFAULT_RULEBOOK.strategy.rr,
                DEFAULT_RULEBOOK.plausibility,
                { compoundStartDollars: 5000, tradesPerDay: 4 },
            ),
        ).toBeNull();
    });

    it.each([
        ['', undefined],
        [' '.repeat(3), undefined],
        ['abc', undefined],
        ['0', undefined],
        ['-50', undefined],
        ['5000', 5000],
        ['5,000', 5000],
        [' 2500.5 ', 2500.5],
    ])('reads the compounding start %j as %s', (text, expected) => {
        expect(compoundStartDollarsOf(text)).toBe(expected);
    });

    it('keeps the compounding start card-local: an empty text field that is not stored', () => {
        const source = componentSource('TradingInputs.tsx');
        expect(source).toContain('Compounding start ($)');
        expect(source).toContain("useState('')");
        expect(source).toContain('tradesPerDay');
        expect(source).not.toContain('onCompoundStartChange');
    });
});
