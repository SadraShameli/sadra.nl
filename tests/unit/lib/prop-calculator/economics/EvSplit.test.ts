import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    dollars,
    FirmId,
    fraction,
    RungSizing,
} from '~/lib/prop-calculator/core';
import {
    attemptEconomicsOfRun,
    conversionEvPerAttempt,
    EconomicsReason,
    fundedProgressValue,
} from '~/lib/prop-calculator/economics';
import { findFirm } from '~/lib/prop-calculator/firms';
import { simulate } from '~/lib/prop-calculator/simulator';

describe('conversionEvPerAttempt', () => {
    it('is P(pass per attempt) x fresh funded value - attempt cost', () => {
        expect(
            conversionEvPerAttempt({
                attemptCost: dollars(250),
                attemptPassProbability: fraction(0.3),
                freshFundedValue: dollars(1000),
            }).value,
        ).toBeCloseTo(50, 9);
    });

    it('never subtracts the activation fee a second time: it equals the run EV per attempt on a plan with an activation fee', () => {
        const plan = findFirm(FirmId.Apex)?.findPlan({
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Eod,
        });
        if (!plan) throw new Error('Apex 50K EOD plan not found');
        expect(plan.fees.activation).toBeGreaterThan(0);
        const outputs = simulate({
            fundedHorizonDays: 252,
            maxEvalDays: 150,
            minRetainedCushion: 2000,
            plan,
            riskPerTrade: 400,
            rrRatio: 2,
            rungSizing: RungSizing.CapToCushion,
            seed: 7,
            tradesPerDay: 2,
            trials: 200,
            winrate: 0.5,
        });
        const run = attemptEconomicsOfRun(outputs, 252).value;
        if (!run) throw new Error('run economics missing');
        const conversion = conversionEvPerAttempt({
            attemptCost: run.attemptCost,
            attemptPassProbability: run.passProbability,
            freshFundedValue: run.fundedValue,
        }).value;
        expect(conversion).toBeCloseTo(run.expectedNetPerAttempt.value, 6);
        expect(conversion).not.toBeCloseTo(
            run.expectedNetPerAttempt.value -
                run.passProbability * plan.fees.activation,
            2,
        );
    });

    it('refuses an invalid pass probability', () => {
        expect(
            conversionEvPerAttempt({
                attemptCost: dollars(250),
                attemptPassProbability: fraction(2),
                freshFundedValue: dollars(1000),
            }).reason,
        ).toBe(EconomicsReason.InvalidInput);
    });
});

describe('fundedProgressValue', () => {
    it('is V(now) - V(fresh funded)', () => {
        expect(
            fundedProgressValue({
                freshFundedValue: dollars(1000),
                valueNow: dollars(1600),
            }).value,
        ).toBeCloseTo(600, 9);
    });

    it('may be negative when the account is worth less than a fresh one', () => {
        expect(
            fundedProgressValue({
                freshFundedValue: dollars(1000),
                valueNow: dollars(400),
            }).value,
        ).toBeCloseTo(-600, 9);
    });

    it('refuses a non-finite value', () => {
        expect(
            fundedProgressValue({
                freshFundedValue: dollars(1000),
                valueNow: dollars(NaN),
            }).reason,
        ).toBe(EconomicsReason.InvalidInput);
    });
});
