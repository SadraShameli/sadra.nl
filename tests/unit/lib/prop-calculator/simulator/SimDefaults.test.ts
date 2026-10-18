import { describe, expect, it } from 'vitest';

import { FirmId, MffuVariant, type Plan } from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import {
    resolveCopyAccounts,
    SIM_DEFAULTS,
    type SimInputs,
    simulate,
} from '~/lib/prop-calculator/simulator';

function baseInputs(): SimInputs {
    return {
        fundedHorizonDays: 20,
        maxEvalDays: 30,
        plan: rapidEodPlan(),
        riskPerTrade: 250,
        rrRatio: 2,
        seed: 7,
        tradesPerDay: 2,
        trials: 300,
        winrate: 0.5,
    };
}

function rapidEodPlan(): Plan {
    const plan = new MyFundedFutures().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFFU Rapid EOD 50K plan not found');
    return plan;
}

describe('SIM_DEFAULTS names the engine defaults once', () => {
    it('lists the neutral value of every optional numeric sim input', () => {
        expect(SIM_DEFAULTS).toStrictEqual({
            commissionPerRoundTrip: 0,
            copyAccounts: 1,
            idleDayProbability: 0,
            maxAttempts: 1,
            rebuyLagDays: 0,
        });
    });

    it('is what simulate uses when the inputs leave those fields out', () => {
        expect(simulate({ ...baseInputs(), ...SIM_DEFAULTS })).toStrictEqual(
            simulate(baseInputs()),
        );
    });
});

describe('N-13: resolveCopyAccounts fails loud instead of clamping the copy-account count', () => {
    it.each([
        [undefined, 1],
        [1, 1],
        [3, 3],
    ])('maps %s to %s', (copyAccounts, expected) => {
        expect(resolveCopyAccounts(copyAccounts)).toBe(expected);
    });

    it.each([2.9, 0, -4, NaN, Infinity])('rejects %s', (copyAccounts) => {
        expect(() => resolveCopyAccounts(copyAccounts)).toThrow(
            /copyAccounts must be a positive safe integer/,
        );
    });

    it('prices a copy bundle the same way simulate does', () => {
        const plan = rapidEodPlan();
        expect(
            simulate({ ...baseInputs(), copyAccounts: 3 }).costPerFundedAccount,
        ).toBe(
            simulate({
                ...baseInputs(),
                copyAccounts: resolveCopyAccounts(3),
            }).costPerFundedAccount,
        );
        expect(
            plan.purchaseDiscounts(undefined, resolveCopyAccounts()),
        ).toStrictEqual(plan.purchaseDiscounts(undefined, 1));
    });
});
