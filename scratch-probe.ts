import {
    computeEvalStateValue,
    computeFundedStateValue,
    FirmId,
    fraction,
    lifetimeExpectedNet,
    MffuVariant,
} from '~/lib/prop-calculator/core';
import { MyFundedFutures } from '~/lib/prop-calculator/firms/mffu/MyFundedFutures';
import { simulate } from '~/lib/prop-calculator/simulator';

const basePlan = new MyFundedFutures().findPlan({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.RapidEod,
});
if (!basePlan) throw new Error('plan not found');
const plan = basePlan.withMaxLifetimePayouts(1);

const rrRatio = 2;
const winrate = 0.4;
const tradesPerDay = 4;
const maxEvalDays = 30;
const feePerAttempt = plan.fees.reset;

console.log('=== Joint L1<->L2 fixed point (one-payout-and-conclude plan) ===');
let guessVFunded = 0;
let dpFundedResult: ReturnType<typeof computeFundedStateValue> | undefined;
let dpEvalResult: ReturnType<typeof computeEvalStateValue> | undefined;
for (let iteration = 0; iteration < 20; iteration++) {
    dpEvalResult = computeEvalStateValue({
        actionStepDollars: 100,
        cushionStepDollars: 200,
        maxEvalDays,
        plan,
        profitStepDollars: 600,
        rrRatio,
        terminalValueAtPass: guessVFunded,
        tradesPerDay,
        winrate: fraction(winrate),
    });
    dpFundedResult = computeFundedStateValue({
        actionStepMultiple: 0.1,
        evalInitialValue: dpEvalResult.initialValue,
        feePerAttempt,
        maxActionMultiple: 0.3,
        plan,
        rrRatio,
        tradesPerDay,
        winrate,
    });
    const delta = Math.abs(dpFundedResult.initialValue - guessVFunded);
    console.log(
        `iter ${iteration}: guessVFunded=${guessVFunded.toFixed(2)} -> V_eval=${dpEvalResult.initialValue.toFixed(2)} -> V_funded=${dpFundedResult.initialValue.toFixed(2)} (delta=${delta.toFixed(4)})`,
    );
    guessVFunded = dpFundedResult.initialValue;
    if (delta < 0.5) break;
}
if (!dpFundedResult || !dpEvalResult) throw new Error('no dp result');
console.log(`\nConverged V_funded: ${guessVFunded.toFixed(2)}`);
console.log(
    'DP bustTerminalValue:',
    dpFundedResult.bustTerminalValue.toFixed(2),
);

for (const horizon of [200, 500, 1000, 2000]) {
    const simOut = simulate({
        evalDayPolicy: dpEvalResult.dayPolicy,
        fundedDayPolicy: dpFundedResult.dayPolicy,
        fundedHorizonDays: horizon,
        maxEvalDays,
        plan,
        riskPerTrade: 250,
        rrRatio,
        seed: 42,
        tradesPerDay,
        trials: 20_000,
        winrate,
    });
    const directFundedValue =
        simOut.expectedGrossPayout +
        simOut.fundedBustProbability * dpFundedResult.bustTerminalValue;
    console.log(
        `horizon=${horizon}: grossPayout=${simOut.expectedGrossPayout.toFixed(2)} bustFunded=${simOut.fundedBustProbability.toFixed(4)} directFundedValue=${directFundedValue.toFixed(2)} (DP=${dpFundedResult.initialValue.toFixed(2)})`,
    );
}
