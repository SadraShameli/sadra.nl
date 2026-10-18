import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { dollars } from '~/lib/prop-calculator';
import {
    NO_PERSONAL_CAPS,
    type PersonalCaps,
    personalCapsSchema,
} from '~/lib/prop-calculator/advisor';

describe('PersonalCaps (PT-19 step 2, PD-37)', () => {
    it('declares nullable max risk per trade, max trades per day and daily profit cap', () => {
        expect(NO_PERSONAL_CAPS).toEqual({
            dailyProfitCap: null,
            maxRiskPerTrade: null,
            maxTradesPerDay: null,
        });
    });

    it('parses every field null (nothing set)', () => {
        expect(personalCapsSchema.parse(NO_PERSONAL_CAPS)).toEqual(
            NO_PERSONAL_CAPS,
        );
    });

    it('parses a fully set personal caps object', () => {
        const caps: PersonalCaps = {
            dailyProfitCap: dollars(400),
            maxRiskPerTrade: dollars(150),
            maxTradesPerDay: 3,
        };

        expect(personalCapsSchema.parse(caps)).toEqual(caps);
    });

    it('rejects a zero or negative max risk per trade', () => {
        expect(() =>
            personalCapsSchema.parse({
                ...NO_PERSONAL_CAPS,
                maxRiskPerTrade: dollars(0),
            }),
        ).toThrow(ZodError);
        expect(() =>
            personalCapsSchema.parse({
                ...NO_PERSONAL_CAPS,
                maxRiskPerTrade: dollars(-10),
            }),
        ).toThrow(ZodError);
    });

    it('rejects a zero or non-integer max trades per day', () => {
        expect(() =>
            personalCapsSchema.parse({
                ...NO_PERSONAL_CAPS,
                maxTradesPerDay: 0,
            }),
        ).toThrow(ZodError);
        expect(() =>
            personalCapsSchema.parse({
                ...NO_PERSONAL_CAPS,
                maxTradesPerDay: 2.5,
            }),
        ).toThrow(ZodError);
    });

    it('rejects an unknown field (strict object)', () => {
        expect(() =>
            personalCapsSchema.parse({
                ...NO_PERSONAL_CAPS,
                retainedCushion: dollars(2000),
            }),
        ).toThrow(ZodError);
    });
});
