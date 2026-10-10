import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    InstrumentSymbol,
    ONE_CENT,
    policySizingOf,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    advisorPlaceableMinimum,
    placeableMinimumFor,
} from '~/lib/prop-calculator/advisor';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const ADVISOR_DIR = 'src/lib/prop-calculator/advisor';

const NQ_AT_20_POINTS = {
    instrument: InstrumentSymbol.NQ,
    stopPoints: 20,
} as const;

function advisorSources(): { file: string; text: string }[] {
    const walk = (directory: string): string[] =>
        readdirSync(path.join(REPO_ROOT, directory), {
            withFileTypes: true,
        }).flatMap((entry) =>
            entry.isDirectory()
                ? walk(`${directory}/${entry.name}`)
                : entry.name.endsWith('.ts')
                  ? `${directory}/${entry.name}`
                  : [],
        );
    return walk(ADVISOR_DIR).map((file) => ({
        file,
        text: readFileSync(path.join(REPO_ROOT, file), 'utf8'),
    }));
}

describe('advisorPlaceableMinimum: one stage-to-sizing mapping for every advisor card (PT-36f review)', () => {
    it('is one contract at the entered stop and one cent without a stop', () => {
        expect(advisorPlaceableMinimum(NQ_AT_20_POINTS)).toBe(400);
        expect(advisorPlaceableMinimum(null)).toBe(ONE_CENT);
        expect(advisorPlaceableMinimum(undefined)).toBe(ONE_CENT);
    });

    it('matches the simulator funded minimum, so the funded card and the simulated funded day place the same unit', () => {
        expect(advisorPlaceableMinimum(NQ_AT_20_POINTS)).toBe(
            placeableMinimumFor(
                policySizingOf(TradingPhase.Funded),
                NQ_AT_20_POINTS,
            ),
        );
    });

    it('differs from the simulated eval minimum on purpose: the eval card refuses a rung below one contract, the simulation sizes in cents', () => {
        expect(
            placeableMinimumFor(
                policySizingOf(TradingPhase.Eval),
                NQ_AT_20_POINTS,
            ),
        ).toBe(ONE_CENT);
        expect(advisorPlaceableMinimum(NQ_AT_20_POINTS)).toBe(400);
    });

    it('names the whole-contract sizing in PlaceableMinimum.ts only', () => {
        const holders = advisorSources()
            .filter(({ text }) => text.includes('PolicySizing.WholeContracts'))
            .map(({ file }) => file);

        expect(holders).toStrictEqual([`${ADVISOR_DIR}/PlaceableMinimum.ts`]);
    });
});
