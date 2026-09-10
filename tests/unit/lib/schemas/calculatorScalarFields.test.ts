import { describe, expect, it } from 'vitest';

import { calculatorScalarFieldsSchema } from '~/lib/schemas/url';

describe('calculatorScalarFieldsSchema rejects out-of-range values', () => {
    it('falls back to the default winrate when the URL claims 99', () => {
        const parsed = calculatorScalarFieldsSchema.parse({ wr: '99' });
        expect(parsed.wr).toBe(0.4);
    });

    it('falls back to the default trial count when the URL claims 9,999,999', () => {
        const parsed = calculatorScalarFieldsSchema.parse({
            trials: '9999999',
        });
        expect(parsed.trials).toBe(2000);
    });

    it('accepts values inside every documented range', () => {
        const parsed = calculatorScalarFieldsSchema.parse({
            act: '50',
            attempts: '5',
            comm: '10',
            copy: '3',
            eval: '25',
            fundedDays: '120',
            maxDays: '90',
            rd: '500',
            rp: '1.5',
            rr: '3',
            seed: '7',
            tpd: '4',
            trials: '1000',
            wr: '0.5',
        });
        expect(parsed).toStrictEqual({
            act: 50,
            attempts: 5,
            comm: 10,
            copy: 3,
            eval: 25,
            fundedDays: 120,
            maxDays: 90,
            rd: 500,
            rp: 1.5,
            rr: 3,
            seed: 7,
            tpd: 4,
            trials: 1000,
            wr: 0.5,
        });
    });

    it('falls back for negative and non-numeric input alike', () => {
        expect(
            calculatorScalarFieldsSchema.parse({ maxDays: '-5' }).maxDays,
        ).toBe(60);
        expect(calculatorScalarFieldsSchema.parse({ rrRatio: 'nope' }).rr).toBe(
            2,
        );
    });
});
