import { describe, expect, it } from 'vitest';

import {
    type BankrollUrlState,
    decodeBankrollUrlState,
    defaultBankrollUrlState,
    encodeBankrollUrlState,
    parseBankrollDollarsField,
    parseBankrollLossThresholdField,
    parseBankrollNonNegativeIntField,
    parseBankrollPositiveIntField,
    parseBankrollReinvestFractionField,
} from '~/app/(app)/prop-calculator/_components/bankroll/bankrollUrlState';
import { dollars, fraction } from '~/lib/prop-calculator';
import { BankrollUrlParameter } from '~/lib/schemas/bankrollUrlParameter';

const BANKROLL_KEYS: readonly string[] = Object.values(BankrollUrlParameter);

function richState(): BankrollUrlState {
    return {
        budget: dollars(5000),
        capacity: 3,
        horizonDays: 180,
        lossThreshold: fraction(0.1),
        monthlyBudget: dollars(2000),
        payoutLagDays: 10,
        reinvestFraction: fraction(0.5),
        start: dollars(5000),
    };
}

function roundTrip(state: BankrollUrlState): BankrollUrlState {
    return decodeBankrollUrlState(
        new URLSearchParams(encodeBankrollUrlState(state)),
    );
}

describe('encodeBankrollUrlState and decodeBankrollUrlState', () => {
    it('round-trips every field when all are set', () => {
        const state = richState();
        expect(roundTrip(state)).toEqual(state);
    });

    it('decodes an empty query to the all-null default (no video figure prefilled)', () => {
        expect(decodeBankrollUrlState(new URLSearchParams())).toEqual(
            defaultBankrollUrlState(),
        );
    });

    it('starts every field empty by default', () => {
        const defaults = defaultBankrollUrlState();
        for (const value of Object.values(defaults)) {
            expect(value).toBeNull();
        }
    });

    it('writes only the keys that are set', () => {
        const state: BankrollUrlState = {
            ...defaultBankrollUrlState(),
            budget: dollars(1500),
        };
        const query = new URLSearchParams(encodeBankrollUrlState(state));
        expect(query.keys().toArray()).toEqual([BankrollUrlParameter.Budget]);
    });

    it('writes no key at all for the all-null default', () => {
        expect(encodeBankrollUrlState(defaultBankrollUrlState())).toBe('');
    });

    it('leaves out the given keys so a field the user is still fixing is never shared', () => {
        const state = richState();
        const omitted = [
            BankrollUrlParameter.Budget,
            BankrollUrlParameter.Start,
        ];
        const query = encodeBankrollUrlState(state, omitted);
        const keys = new URLSearchParams(query).keys().toArray();
        expect(keys).not.toContain(BankrollUrlParameter.Budget);
        expect(keys).not.toContain(BankrollUrlParameter.Start);
        const decoded = decodeBankrollUrlState(new URLSearchParams(query));
        expect(decoded.budget).toBeNull();
        expect(decoded.start).toBeNull();
    });
});

describe('decodeBankrollUrlState drops each invalid value on its own', () => {
    it.each(['abc', '-5', '0', 'NaN', 'Infinity', '', '1e400'])(
        'drops an invalid budget %j',
        (raw) => {
            const parameters = new URLSearchParams();
            parameters.set(BankrollUrlParameter.Budget, raw);
            expect(decodeBankrollUrlState(parameters).budget).toBeNull();
        },
    );

    it.each(['abc', '-1', '0', '0.6', '2', ''])(
        'drops an invalid loss threshold %j (must be in (0, 0.5])',
        (raw) => {
            const parameters = new URLSearchParams();
            parameters.set(BankrollUrlParameter.LossThreshold, raw);
            expect(decodeBankrollUrlState(parameters).lossThreshold).toBeNull();
        },
    );

    it('accepts a loss threshold at the 0.5 boundary', () => {
        const parameters = new URLSearchParams();
        parameters.set(BankrollUrlParameter.LossThreshold, '0.5');
        expect(decodeBankrollUrlState(parameters).lossThreshold).toBe(0.5);
    });

    it.each(['abc', '-0.1', '1.1', ''])(
        'drops an invalid reinvest fraction %j (must be in [0, 1])',
        (raw) => {
            const parameters = new URLSearchParams();
            parameters.set(BankrollUrlParameter.Reinvest, raw);
            expect(
                decodeBankrollUrlState(parameters).reinvestFraction,
            ).toBeNull();
        },
    );

    it.each(['0', '-1', '1.5', 'abc', ''])(
        'drops an invalid capacity %j (must be a positive integer)',
        (raw) => {
            const parameters = new URLSearchParams();
            parameters.set(BankrollUrlParameter.Capacity, raw);
            expect(decodeBankrollUrlState(parameters).capacity).toBeNull();
        },
    );

    it.each(['-1', 'abc', ''])(
        'drops an invalid payout lag %j (must be a non-negative integer)',
        (raw) => {
            const parameters = new URLSearchParams();
            parameters.set(BankrollUrlParameter.PayoutLagDays, raw);
            expect(decodeBankrollUrlState(parameters).payoutLagDays).toBeNull();
        },
    );

    it('accepts a payout lag of exactly 0', () => {
        const parameters = new URLSearchParams();
        parameters.set(BankrollUrlParameter.PayoutLagDays, '0');
        expect(decodeBankrollUrlState(parameters).payoutLagDays).toBe(0);
    });
});

describe('the bankroll query keys', () => {
    it('are unique', () => {
        expect(new Set(BANKROLL_KEYS).size).toBe(BANKROLL_KEYS.length);
    });
});

describe('the bankroll form-field parsers', () => {
    it('accept what the query accepts and give null otherwise', () => {
        expect(parseBankrollDollarsField('5000')).toBe(5000);
        expect(parseBankrollDollarsField('abc')).toBeNull();
        expect(parseBankrollLossThresholdField('0.3')).toBe(0.3);
        expect(parseBankrollLossThresholdField('0.6')).toBeNull();
        expect(parseBankrollReinvestFractionField('0.5')).toBe(0.5);
        expect(parseBankrollReinvestFractionField('1.5')).toBeNull();
        expect(parseBankrollPositiveIntField('10')).toBe(10);
        expect(parseBankrollPositiveIntField('0')).toBeNull();
        expect(parseBankrollNonNegativeIntField('0')).toBe(0);
        expect(parseBankrollNonNegativeIntField('-1')).toBeNull();
    });
});
