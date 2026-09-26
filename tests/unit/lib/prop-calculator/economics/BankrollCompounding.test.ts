import { describe, expect, it } from 'vitest';

import { dollars } from '~/lib/prop-calculator/core';
import {
    compareCycles,
    compoundedBankroll,
    EconomicsDisclosure,
    EconomicsReason,
} from '~/lib/prop-calculator/economics';

const videoThreeX = {
    cycleDays: 30,
    horizonDays: 90,
    multiple: 3,
    start: dollars(5000),
} as const;

const videoThreePointFiveX = {
    cycleDays: 60,
    horizonDays: 180,
    multiple: 3.5,
    start: dollars(5000),
} as const;

describe('compoundedBankroll (deterministic illustration)', () => {
    it('grows 5,000 at 3x per 30-day cycle to 135,000 over 90 days', () => {
        const { cycleDays, horizonDays, multiple, start } = videoThreeX;
        expect(
            compoundedBankroll(start, multiple, cycleDays, horizonDays).value,
        ).toBeCloseTo(135_000, 6);
    });

    it('computes 214,375 at 3.5x per 60 days over 180 days, not the video stated about 150K', () => {
        const { cycleDays, horizonDays, multiple, start } =
            videoThreePointFiveX;
        expect(
            compoundedBankroll(start, multiple, cycleDays, horizonDays).value,
        ).toBeCloseTo(214_375, 6);
    });

    it('counts only whole cycles inside the horizon', () => {
        expect(compoundedBankroll(dollars(1000), 2, 30, 89).value).toBeCloseTo(
            4000,
            9,
        );
    });

    it('carries the DeterministicIllustration disclosure on every result', () => {
        const { cycleDays, horizonDays, multiple, start } = videoThreeX;
        expect(
            compoundedBankroll(start, multiple, cycleDays, horizonDays)
                .disclosures,
        ).toEqual([EconomicsDisclosure.DeterministicIllustration]);
    });

    it.each([
        [-1, 3, 30, 90],
        [5000, -1, 30, 90],
        [5000, 3, 0, 90],
        [5000, 3, 30, -1],
    ])('refuses start %f, multiple %f, cycle %f, horizon %f', (s, m, c, h) => {
        expect(compoundedBankroll(dollars(s), m, c, h).reason).toBe(
            EconomicsReason.InvalidInput,
        );
    });
});

describe('compareCycles', () => {
    it('shows one 5x cycle over 60 days at 25,000 against two 3x cycles of 30 days at 45,000', () => {
        const [single, chained] = compareCycles(
            dollars(5000),
            [
                { cycleDays: 60, multiple: 5 },
                { cycleDays: 30, multiple: 3 },
            ],
            60,
        );
        expect(single?.value).toBeCloseTo(25_000, 6);
        expect(chained?.value).toBeCloseTo(45_000, 6);
        expect(single?.disclosures).toEqual([
            EconomicsDisclosure.DeterministicIllustration,
        ]);
        expect(chained?.disclosures).toEqual([
            EconomicsDisclosure.DeterministicIllustration,
        ]);
    });

    it('returns nothing for no cycles', () => {
        expect(compareCycles(dollars(5000), [], 60)).toEqual([]);
    });
});
