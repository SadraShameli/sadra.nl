import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    ApexVariant,
    dollars,
    type Dollars,
    FirmId,
    fraction,
    type Fraction0to1,
    InstrumentSymbol,
    type Plan,
    RungSizing,
} from '~/lib/prop-calculator/core';
import {
    AccountBasis,
    type AttemptEconomics,
    attemptEconomics,
    attemptEconomicsOfRun,
    EconomicsReason,
    fundedValueFrom,
    NetBasis,
    type RunAttemptEconomics,
    type RunAttemptOutputs,
} from '~/lib/prop-calculator/economics';
import { findFirm } from '~/lib/prop-calculator/firms';
import { type SimOutputs, simulate } from '~/lib/prop-calculator/simulator';

import { payoutCapToyPlan } from '../simulator/toyPlans';

const videoFiftyK = {
    attemptCost: dollars(100),
    fundedValue: dollars(1000),
} as const;

const toyRun: RunAttemptOutputs = {
    attemptPassProbability: 0.3,
    copyAccounts: 1,
    costPerAttempt: 300,
    estimates: {
        attemptPassProbability: { standardError: 0.02, value: 0.3 },
        costPerAttempt: { standardError: 4, value: 300 },
        expectedNetPerAttempt: { standardError: 35, value: 150 },
    },
    expectedAttempts: 2,
    expectedLiveTransferCash: 0,
    expectedNetPerAttempt: 150,
    expectedPayoutPerFundedAccount: 1500,
};

const toyTransferRun: RunAttemptOutputs = {
    ...toyRun,
    expectedLiveTransferCash: 60,
    expectedNetPerAttempt: 180,
};

function apexFiftyKEod(): Plan {
    const plan = findFirm(FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('Apex 50K EOD plan not found');
    return plan;
}

describe('attemptEconomics (video 50K worked example)', () => {
    it('gives funded value / attempt cost 10, labelled as gross with net 9:1', () => {
        const result = attemptEconomics({
            ...videoFiftyK,
            passProbability: fraction(0.1),
        });
        expect(result.reason).toBeNull();
        const ratio = result.value?.fundedValueToAttemptCost;
        expect(ratio?.value?.ratio).toBeCloseTo(10, 12);
        expect(ratio?.value?.netToOne).toBeCloseTo(9, 12);
        expect(ratio?.value?.label).toBe(
            'funded value / attempt cost; net 9:1',
        );
    });

    it('gives the breakeven pass rate as attempt cost / funded value (0.10)', () => {
        const result = attemptEconomics({
            ...videoFiftyK,
            passProbability: fraction(0.1),
        });
        expect(result.value?.breakevenPassRate.value).toBeCloseTo(0.1, 12);
        expect(result.value?.expectedNetPerAttempt).toBeCloseTo(0, 9);
    });

    it('moves the breakeven to 0.25 at a 250 attempt cost, where EV at 25% is zero', () => {
        const result = attemptEconomics({
            attemptCost: dollars(250),
            fundedValue: dollars(1000),
            passProbability: fraction(0.25),
        });
        expect(result.value?.breakevenPassRate.value).toBeCloseTo(0.25, 12);
        expect(result.value?.expectedNetPerAttempt).toBeCloseTo(0, 9);
        expect(result.value?.passMargin.value).toBeCloseTo(0, 12);
    });

    it('gives EV 50 and a pass margin of 0.05 at 30% and cost 250', () => {
        const result = attemptEconomics({
            attemptCost: dollars(250),
            fundedValue: dollars(1000),
            passProbability: fraction(0.3),
        });
        expect(result.value?.expectedNetPerAttempt).toBeCloseTo(50, 9);
        expect(result.value?.passMargin.value).toBeCloseTo(0.05, 12);
    });

    it('has no breakeven and no margin with NoFundedValue at a zero funded value', () => {
        const result = attemptEconomics({
            attemptCost: dollars(100),
            fundedValue: dollars(0),
            passProbability: fraction(0.3),
        });
        expect(result.value?.breakevenPassRate).toMatchObject({
            reason: EconomicsReason.NoFundedValue,
            value: null,
        });
        expect(result.value?.passMargin.reason).toBe(
            EconomicsReason.NoFundedValue,
        );
        expect(result.value?.fundedValueToAttemptCost.value?.ratio).toBe(0);
        expect(result.value?.expectedNetPerAttempt).toBeCloseTo(-100, 9);
    });

    it('marks a breakeven above certainty as Unreachable', () => {
        const result = attemptEconomics({
            attemptCost: dollars(2000),
            fundedValue: dollars(1000),
            passProbability: fraction(0.9),
        });
        expect(result.value?.breakevenPassRate.reason).toBe(
            EconomicsReason.Unreachable,
        );
        expect(result.value?.passMargin.reason).toBe(
            EconomicsReason.Unreachable,
        );
    });

    it('has no funded value / attempt cost ratio at a zero attempt cost', () => {
        const result = attemptEconomics({
            attemptCost: dollars(0),
            fundedValue: dollars(1000),
            passProbability: fraction(0.3),
        });
        expect(result.value?.fundedValueToAttemptCost.reason).toBe(
            EconomicsReason.ZeroAttemptCost,
        );
        expect(result.value?.breakevenPassRate.value).toBe(0);
    });

    it.each([
        { attemptCost: -1, fundedValue: 1000, passProbability: 0.3 },
        { attemptCost: 100, fundedValue: -1, passProbability: 0.3 },
        { attemptCost: 100, fundedValue: 1000, passProbability: 1.2 },
        { attemptCost: NaN, fundedValue: 1000, passProbability: 0.3 },
    ])('refuses invalid inputs %o', (inputs) => {
        const result = attemptEconomics({
            attemptCost: dollars(inputs.attemptCost),
            fundedValue: dollars(inputs.fundedValue),
            passProbability: fraction(inputs.passProbability),
        });
        expect(result.reason).toBe(EconomicsReason.InvalidInput);
    });
});

describe('fundedValueFrom', () => {
    it('is P(payout given funded) x payouts per paid funded x average payout', () => {
        expect(
            fundedValueFrom({
                averagePayout: dollars(1000),
                payoutProbabilityGivenFunded: fraction(0.5),
                payoutsPerPaidFunded: 2,
            }).value,
        ).toBeCloseTo(1000, 9);
    });

    it('refuses a negative payout count', () => {
        expect(
            fundedValueFrom({
                averagePayout: dollars(1000),
                payoutProbabilityGivenFunded: fraction(0.5),
                payoutsPerPaidFunded: -1,
            }).reason,
        ).toBe(EconomicsReason.InvalidInput);
    });
});

describe('attemptEconomicsOfRun (one EV-per-attempt definition, VD-28)', () => {
    it('reads the engine per-attempt fields and their standard errors, never re-deriving them', () => {
        const result = attemptEconomicsOfRun(toyRun, 252);
        expect(result.reason).toBeNull();
        expect(result.value?.expectedNetPerAttempt).toEqual({
            standardError: 35,
            value: 150,
        });
        expect(result.value?.attemptCost).toBe(300);
        expect(result.value?.attemptCostStandardError).toBe(4);
        expect(result.value?.passProbability).toBe(0.3);
        expect(result.value?.passProbabilityStandardError).toBe(0.02);
        expect(result.value?.fundedValue).toBe(1500);
        expect(result.value?.breakevenPassRate.value).toBeCloseTo(0.2, 12);
        expect(result.value?.fundedHorizonDays).toBe(252);
        expect(result.value?.basis).toBe(NetBasis.CreditFree);
        expect(result.value?.accountBasis).toBe(AccountBasis.CopyGroup);
        expect(result.value?.copyAccounts).toBe(1);
    });

    it('prices a copy group like the engine: the funded value takes the multiplier, the engine per-attempt dollars already carry it, the probability never does', () => {
        const result = attemptEconomicsOfRun(
            {
                ...toyRun,
                copyAccounts: 3,
                costPerAttempt: 900,
                estimates: {
                    ...toyRun.estimates,
                    costPerAttempt: { standardError: 12, value: 900 },
                    expectedNetPerAttempt: { standardError: 105, value: 450 },
                },
                expectedNetPerAttempt: 450,
            },
            252,
        );
        expect(result.value?.fundedValue).toBe(4500);
        expect(result.value?.attemptCost).toBe(900);
        expect(result.value?.passProbability).toBe(0.3);
        expect(result.value?.expectedNetPerAttempt).toEqual({
            standardError: 105,
            value: 450,
        });
        expect(result.value?.accountBasis).toBe(AccountBasis.CopyGroup);
        expect(result.value?.copyAccounts).toBe(3);
    });

    it('brands the probabilities and the dollar estimate', () => {
        expectTypeOf<
            AttemptEconomics['breakevenPassRate']['value']
        >().toEqualTypeOf<Fraction0to1 | null>();
        expectTypeOf<
            RunAttemptEconomics['expectedNetPerAttempt']['value']
        >().toEqualTypeOf<Dollars>();
    });

    it('refuses a run whose attempt pass probability is not a probability', () => {
        expect(
            attemptEconomicsOfRun(
                { ...toyRun, attemptPassProbability: NaN },
                252,
            ).reason,
        ).toBe(EconomicsReason.InvalidInput);
    });

    it.each([1, 3])(
        'decomposes a real run exactly at %i copy accounts: P(pass per attempt) x funded value - attempt cost = the engine EV per attempt (credit-free basis, activation on pass included)',
        (copyAccounts) => {
            const plan = apexFiftyKEod();
            expect(plan.fees.activation).toBeGreaterThan(0);
            const outputs: SimOutputs = simulate({
                copyAccounts,
                fundedHorizonDays: 252,
                maxAttempts: 3,
                maxEvalDays: 150,
                minRetainedCushion: 2000,
                plan,
                riskPerTrade: 400,
                rrRatio: 2,
                rungSizing: RungSizing.CapToCushion,
                seed: 42,
                tradesPerDay: 2,
                trials: 200,
                winrate: 0.5,
            });
            const run = attemptEconomicsOfRun(outputs, 252).value;
            expect(run).not.toBeNull();
            if (!run) return;
            expect(run.expectedNetPerAttempt.value).toBe(
                outputs.expectedNetPerAttempt,
            );
            expect(run.expectedNetPerAttempt.standardError).toBe(
                outputs.estimates.expectedNetPerAttempt.standardError,
            );
            expect(run.attemptCost).toBe(outputs.costPerAttempt);
            expect(run.passProbability).toBe(outputs.attemptPassProbability);
            expect(run.copyAccounts).toBe(copyAccounts);
            expect(run.passProbability).toBeGreaterThan(0);
            expect(run.passProbability).toBeLessThan(
                outputs.evalPassProbability,
            );
            const decomposed = attemptEconomics({
                attemptCost: run.attemptCost,
                fundedValue: run.fundedValue,
                passProbability: run.passProbability,
            }).value?.expectedNetPerAttempt;
            expect(decomposed).toBeDefined();
            const relative =
                Math.abs((decomposed ?? 0) - run.expectedNetPerAttempt.value) /
                Math.max(1, Math.abs(run.expectedNetPerAttempt.value));
            expect(relative).toBeLessThan(1e-9);
        },
    );

    it('carries zero live transfer cash per attempt on a run without a transfer', () => {
        expect(
            attemptEconomicsOfRun(toyRun, 252).value
                ?.liveTransferCashPerAttempt,
        ).toBe(0);
    });

    it('prices the live transfer cash per attempt as the expected cash per run over the expected attempts per run', () => {
        const run = attemptEconomicsOfRun(toyTransferRun, 252).value;
        expect(run?.liveTransferCashPerAttempt).toBe(30);
        expect(run?.expectedNetPerAttempt.value).toBe(180);
    });

    it('has formula terms that sum to the printed EV on a live-transfer run', () => {
        const run = attemptEconomicsOfRun(toyTransferRun, 252).value;
        if (!run) throw new Error('run economics missing');
        const terms =
            run.passProbability * run.fundedValue +
            run.liveTransferCashPerAttempt -
            run.attemptCost;
        expect(terms).toBeCloseTo(run.expectedNetPerAttempt.value, 9);
    });

    it('folds the live transfer cash per attempt into the breakeven pass rate and the ratio so they stay the zero-EV rate', () => {
        const run = attemptEconomicsOfRun(toyTransferRun, 252).value;
        if (!run) throw new Error('run economics missing');
        expect(run.fundedValueWithLiveTransfer).toBeCloseTo(1600, 9);
        expect(run.breakevenPassRate.value).toBeCloseTo(300 / 1600, 9);
        const atBreakeven =
            (run.breakevenPassRate.value ?? NaN) *
                run.fundedValueWithLiveTransfer -
            run.attemptCost;
        expect(atBreakeven).toBeCloseTo(0, 9);
        expect(run.passMargin.value).toBeCloseTo(0.3 - 300 / 1600, 9);
        expect(run.fundedValueToAttemptCost.value?.ratio).toBeCloseTo(
            1600 / 300,
            9,
        );
        expect(run.fundedValueToAttemptCost.value?.ratioText).toBe('5.33:1');
        expect(run.fundedValueToAttemptCost.value?.netText).toBe('4.33:1');
    });

    it('keeps the breakeven pass rate and the ratio unchanged on a run without a transfer', () => {
        const run = attemptEconomicsOfRun(toyRun, 252).value;
        if (!run) throw new Error('run economics missing');
        expect(run.fundedValueWithLiveTransfer).toBe(run.fundedValue);
        expect(run.breakevenPassRate.value).toBeCloseTo(0.2, 12);
        expect(run.fundedValueToAttemptCost.value?.ratio).toBeCloseTo(5, 12);
    });

    it('prices a live transfer on a run with no funded value as a breakeven from the transfer alone', () => {
        const run = attemptEconomicsOfRun(
            {
                ...toyTransferRun,
                costPerAttempt: 30,
                expectedPayoutPerFundedAccount: 0,
            },
            252,
        ).value;
        if (!run) throw new Error('run economics missing');
        expect(run.fundedValueWithLiveTransfer).toBeCloseTo(100, 9);
        expect(run.breakevenPassRate.value).toBeCloseTo(0.3, 9);
    });

    it('refuses a run that carries live transfer cash with a zero pass probability', () => {
        expect(
            attemptEconomicsOfRun(
                { ...toyTransferRun, attemptPassProbability: 0 },
                252,
            ).reason,
        ).toBe(EconomicsReason.InvalidInput);
    });

    it('adds up on a simulated live-transfer run: pass x funded value + live transfer cash per attempt - attempt cost = the engine EV per attempt', () => {
        const outputs = simulate({
            fundedHorizonDays: 50,
            instrument: InstrumentSymbol.MNQ,
            liveTransferHazard: fraction(1),
            maxEvalDays: 1,
            plan: payoutCapToyPlan(),
            riskPerTrade: 100,
            rrRatio: 1,
            seed: 7,
            stopPoints: 10,
            tradesPerDay: 1,
            trials: 40,
            winrate: 1,
        });
        expect(outputs.expectedLiveTransferCash).toBeGreaterThan(0);
        const run = attemptEconomicsOfRun(outputs, 50).value;
        if (!run) throw new Error('run economics missing');
        expect(run.liveTransferCashPerAttempt).toBeGreaterThan(0);
        const terms =
            run.passProbability * run.fundedValue +
            run.liveTransferCashPerAttempt -
            run.attemptCost;
        const relative =
            Math.abs(terms - run.expectedNetPerAttempt.value) /
            Math.max(1, Math.abs(run.expectedNetPerAttempt.value));
        expect(relative).toBeLessThan(1e-9);
    });

    it.each([
        { expectedAttempts: 0, expectedLiveTransferCash: 60 },
        { expectedAttempts: 2, expectedLiveTransferCash: NaN },
    ])(
        'refuses live transfer inputs that cannot be priced per attempt %o',
        (inputs) => {
            expect(
                attemptEconomicsOfRun({ ...toyTransferRun, ...inputs }, 252)
                    .reason,
            ).toBe(EconomicsReason.InvalidInput);
        },
    );
});
