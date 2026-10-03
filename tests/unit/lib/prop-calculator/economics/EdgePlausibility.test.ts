import { describe, expect, it } from 'vitest';

import { formatCurrency, formatPercent } from '~/lib/format';
import { fraction, TRADING_DAYS_PER_MONTH } from '~/lib/prop-calculator/core';
import {
    compoundedMultiple,
    EconomicsDisclosure,
    EconomicsReason,
    edgePlausibility,
    edgePlausibilityNoteText,
    expectancyPerTradeR,
    fullKellyFraction,
    kellyGrowthPerTrade,
    PlausibilityLevel,
    type PlausibilityThresholds,
} from '~/lib/prop-calculator/economics';

const plannerThresholds: PlausibilityThresholds = {
    strongMaxExpectancyR: 0.35,
    typicalMaxExpectancyR: 0.3,
};

function levelOf(winrate: number, rrRatio: number): null | PlausibilityLevel {
    return (
        edgePlausibility({
            rrRatio,
            thresholds: plannerThresholds,
            winrate: fraction(winrate),
        }).value?.level ?? null
    );
}

describe('edgePlausibility', () => {
    it('calls 70% at 1:1 (0.40R) Implausible', () => {
        expect(levelOf(0.7, 1)).toBe(PlausibilityLevel.Implausible);
    });

    it('calls 40% at 1:2 (0.20R) and 52% at 1:1 (0.04R) Typical', () => {
        expect(levelOf(0.4, 2)).toBe(PlausibilityLevel.Typical);
        expect(levelOf(0.52, 1)).toBe(PlausibilityLevel.Typical);
    });

    it('calls an expectancy between the two thresholds Strong', () => {
        expect(levelOf(0.66, 1)).toBe(PlausibilityLevel.Strong);
    });

    it('keeps an expectancy exactly on a threshold in the lower level', () => {
        expect(levelOf(0.65, 1)).toBe(PlausibilityLevel.Typical);
        expect(levelOf(0.675, 1)).toBe(PlausibilityLevel.Strong);
    });

    it('calls negative and zero expectancy NoEdge', () => {
        expect(levelOf(0.3, 1)).toBe(PlausibilityLevel.NoEdge);
        expect(levelOf(0.5, 1)).toBe(PlausibilityLevel.NoEdge);
    });

    it('reads expectancy and Kelly from EdgeMath', () => {
        const result = edgePlausibility({
            rrRatio: 1,
            thresholds: plannerThresholds,
            winrate: fraction(0.7),
        }).value;
        expect(result?.expectancyR).toBe(
            expectancyPerTradeR(fraction(0.7), 1).value,
        );
        expect(result?.fullKelly).toBe(
            fullKellyFraction(fraction(0.7), 1).value,
        );
        expect(result?.kellyGrowthPerTrade).toEqual(
            kellyGrowthPerTrade(fraction(0.7), 1),
        );
    });

    it('carries the Kelly sizing disclosure with the Kelly figures it returns', () => {
        expect(
            edgePlausibility({
                rrRatio: 2,
                thresholds: plannerThresholds,
                winrate: fraction(0.4),
            }).disclosures,
        ).toContain(EconomicsDisclosure.KellyNotPropSizing);
    });

    it('uses the thresholds passed in, never its own', () => {
        const result = edgePlausibility({
            rrRatio: 2,
            thresholds: {
                strongMaxExpectancyR: 0.15,
                typicalMaxExpectancyR: 0.1,
            },
            winrate: fraction(0.4),
        }).value;
        expect(result?.level).toBe(PlausibilityLevel.Implausible);
    });

    it.each([
        { strongMaxExpectancyR: 0.2, typicalMaxExpectancyR: 0.3 },
        { strongMaxExpectancyR: NaN, typicalMaxExpectancyR: 0.3 },
        { strongMaxExpectancyR: 0.35, typicalMaxExpectancyR: -0.1 },
    ])('refuses thresholds %o', (thresholds) => {
        expect(
            edgePlausibility({
                rrRatio: 1,
                thresholds,
                winrate: fraction(0.6),
            }).reason,
        ).toBe(EconomicsReason.InvalidInput);
    });

    it('refuses an invalid winrate', () => {
        expect(
            edgePlausibility({
                rrRatio: 1,
                thresholds: plannerThresholds,
                winrate: fraction(1.4),
            }).reason,
        ).toBe(EconomicsReason.InvalidInput);
    });
});

const INFORMATION_LABEL =
    'information, not sizing; Kelly is not prop-firm sizing';

function multipleIn(note: null | string): number {
    const match = /compounds to ([\d,]+(?:\.\d+)?)x/.exec(note ?? '');
    if (match?.[1] === undefined) throw new Error(`no multiple in ${note}`);
    return Number(match[1].replaceAll(',', ''));
}

describe('edgePlausibilityNoteText Kelly growth and pace (F-V22, PT-86)', () => {
    const growth = kellyGrowthPerTrade(fraction(0.7), 1).value;
    if (growth === null) throw new Error('expected a growth');
    const inputs = { rrRatio: 1, winrate: fraction(0.7) };

    it('appends the full-Kelly growth per trade, labelled information, to an Implausible note', () => {
        const note = edgePlausibilityNoteText(inputs, plannerThresholds);
        expect(note).toContain('Implausible edge');
        expect(note).toContain(`${formatPercent(Math.expm1(growth), 2)} per trade`);
        expect(note).toContain(INFORMATION_LABEL);
    });

    it('prints the geometric rate per trade, which is the exponential of the log growth minus one, not the log growth', () => {
        const highEdge = { rrRatio: 2, winrate: fraction(0.9) };
        const logGrowth = kellyGrowthPerTrade(
            highEdge.winrate,
            highEdge.rrRatio,
        ).value;
        if (logGrowth === null) throw new Error('expected a growth');
        const geometric = Math.expm1(logGrowth);
        expect(formatPercent(geometric, 2)).not.toBe(
            formatPercent(logGrowth, 2),
        );
        const note = edgePlausibilityNoteText(highEdge, plannerThresholds);
        expect(note).toContain(`${formatPercent(geometric, 2)} per trade`);
        expect(note).not.toContain(`${formatPercent(logGrowth, 2)} per trade`);
    });

    it('shows the compounded multiple over one trading month at the entered pace', () => {
        const note = edgePlausibilityNoteText(
            { ...inputs, tradesPerDay: 4 },
            plannerThresholds,
        );
        const expected = compoundedMultiple(
            growth,
            4 * TRADING_DAYS_PER_MONTH,
        ).value;
        expect(expected).not.toBeNull();
        expect(note).toContain('4 trades per day');
        expect(note).toContain(
            `${String(TRADING_DAYS_PER_MONTH)} trading days`,
        );
        expect(multipleIn(note)).toBeCloseTo(expected ?? 0, 1);
    });

    it('shows the amount from a start in dollars', () => {
        const note = edgePlausibilityNoteText(
            { ...inputs, compoundStartDollars: 5000, tradesPerDay: 4 },
            plannerThresholds,
        );
        const expected = compoundedMultiple(
            growth,
            4 * TRADING_DAYS_PER_MONTH,
        ).value;
        expect(note).toContain(formatCurrency(5000));
        expect(note).toContain(formatCurrency(5000 * (expected ?? 0)));
    });

    it('leaves the pace sentence out without trades per day, and the start without a pace', () => {
        const note = edgePlausibilityNoteText(
            { ...inputs, compoundStartDollars: 5000 },
            plannerThresholds,
        );
        expect(note).toContain(`${formatPercent(Math.expm1(growth), 2)} per trade`);
        expect(note).not.toContain('trades per day');
        expect(note).not.toContain('compounds to');
        expect(note).not.toContain(formatCurrency(5000));
    });

    it.each([0, -3, NaN, Infinity])(
        'leaves the pace sentence out for trades per day %s',
        (tradesPerDay) => {
            const note = edgePlausibilityNoteText(
                { ...inputs, tradesPerDay },
                plannerThresholds,
            );
            expect(note).not.toContain('compounds to');
        },
    );

    it.each([0, -1, NaN])(
        'leaves the amount out for a start of %s',
        (compoundStartDollars) => {
            const note = edgePlausibilityNoteText(
                { ...inputs, compoundStartDollars, tradesPerDay: 4 },
                plannerThresholds,
            );
            expect(note).toContain('compounds to');
            expect(note).not.toContain('becomes');
        },
    );

    it('still shows no note for a Typical edge, pace or not', () => {
        expect(
            edgePlausibilityNoteText(
                {
                    compoundStartDollars: 5000,
                    rrRatio: 2,
                    tradesPerDay: 4,
                    winrate: fraction(0.4),
                },
                plannerThresholds,
            ),
        ).toBeNull();
    });

    it('says there is no growth for a No edge note instead of a figure', () => {
        const note = edgePlausibilityNoteText(
            { rrRatio: 1, tradesPerDay: 4, winrate: fraction(0.3) },
            plannerThresholds,
        );
        expect(note).toContain('No edge');
        expect(note).not.toContain('compounds to');
        expect(note).not.toContain('Full Kelly would grow');
    });

    it('says the multiple is too large to show instead of printing Infinity', () => {
        const note = edgePlausibilityNoteText(
            { rrRatio: 5, tradesPerDay: 50, winrate: fraction(0.95) },
            plannerThresholds,
        );
        expect(note).not.toContain('Infinity');
        expect(note).toContain('too large to show');
    });

    it('has no em dash', () => {
        const note = edgePlausibilityNoteText(
            { ...inputs, compoundStartDollars: 5000, tradesPerDay: 4 },
            plannerThresholds,
        );
        expect(note).not.toContain('\u{2014}');
    });
});
