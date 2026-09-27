import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { tradingEdgePlausibilityNote } from '~/app/(app)/prop-calculator/_components/TradingInputs';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

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
        expect(source).toContain(
            'const plausibilityNote = tradingEdgePlausibilityNote(winrate, rrRatio);',
        );
    });
});
