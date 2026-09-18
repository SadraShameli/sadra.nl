import { describe, expect, it } from 'vitest';

import {
    ConsistencyScope,
    ContractLimitKind,
    DrawdownKind,
    E8FuturesVariant,
    FirmId,
    maxContractsAt,
    PayoutFloorEffect,
} from '~/lib/prop-calculator/core';
import {
    newFundedCycleTracker,
    tryFundedPayout,
} from '~/lib/prop-calculator/core/FundedPayoutCycle';
import { TradingPhase } from '~/lib/prop-calculator/core/TradingPhase';
import { ALL_FIRMS, findFirm } from '~/lib/prop-calculator/firms';
import { E8Futures } from '~/lib/prop-calculator/firms/e8futures/E8Futures';

function findE8ZeroPlan(variant: E8FuturesVariant) {
    const found = new E8Futures().findPlan({
        accountSize: 50_000,
        firm: FirmId.E8Futures,
        variant,
    });
    if (!found) throw new Error(`E8 Zero plan ${variant} not found`);
    return found;
}

const plan = (() => {
    const found = new E8Futures().findPlan({
        accountSize: 50_000,
        firm: FirmId.E8Futures,
        variant: E8FuturesVariant.Signature,
    });
    if (!found) throw new Error('E8 Futures Signature 50K plan not found');
    return found;
})();

describe('E8 Futures Signature 50K', () => {
    it('is registered in ALL_FIRMS and findable via findFirm', () => {
        expect(findFirm(FirmId.E8Futures)).toBeInstanceOf(E8Futures);
        expect(ALL_FIRMS.some((firm) => firm.id === FirmId.E8Futures)).toBe(
            true,
        );
    });

    it('matches the live-verified core numbers', () => {
        expect(plan.drawdown.kind).toBe(DrawdownKind.EodTrailing);
        expect(plan.drawdown.amount).toBe(2000);
        expect(plan.drawdown.lock?.atProfit).toBe(2000);
        expect(plan.drawdown.lock?.lockedThreshold(50_000)).toBe(50_000);
        expect(plan.profitTarget).toBe(3000);
        expect(plan.fees.oneTimeEval).toBe(160);
        expect(plan.fees.reset).toBe(160);
        expect(plan.minPayoutProfit).toBe(2000);
    });

    it('stays EOD-trailing once funded instead of switching to an intraday trail', () => {
        expect(plan.fundedDrawdown.kind).toBe(DrawdownKind.EodTrailing);
        expect(plan.fundedDrawdown).toBe(plan.drawdown);
    });

    it('does not repeat the TPT bug: minPayoutRequest is explicit and independent of minPayoutProfit', () => {
        expect(plan.minPayoutRequest).toBe(100);
        expect(plan.minPayoutRequest).not.toBe(plan.minPayoutProfit);
    });

    it('applies the 35% consistency bar to the funded stage only', () => {
        expect(plan.evalConsistencyRule()).toBeNull();
        const funded = plan.fundedConsistencyRule();
        expect(funded?.scope).toBe(ConsistencyScope.Funded);
        expect(funded?.maxBestDayShare).toBe(0.35);
    });

    it('the payout cap steps up by payout count (1250 / 2250 / 3250), not a flat first-tier value', () => {
        const state = plan.initialState();
        expect(plan.resolvedPayoutCap(state, 0).requestCap).toBe(1250);
        expect(plan.resolvedPayoutCap(state, 1).requestCap).toBe(1250);
        expect(plan.resolvedPayoutCap(state, 2).requestCap).toBe(2250);
        expect(plan.resolvedPayoutCap(state, 3).requestCap).toBe(2250);
        expect(plan.resolvedPayoutCap(state, 4).requestCap).toBe(3250);
        expect(plan.resolvedPayoutCap(state, 40).requestCap).toBe(3250);
    });

    it('closes both the evaluation and funded account after 7 consecutive days without a trade (live-verified 2026-09-13 against helpfutures.e8markets.com)', () => {
        expect(plan.maxConsecutiveIdleDays).toBe(7);
    });

    it(
        'concludes the funded cycle after 5 lifetime payouts, not indefinitely at the flat $3,250 tier ' +
            "(live-verified 2026-09-14 against helpfutures.e8markets.com's 'Payout caps and buffers for E8 Signature Futures explained')",
        () => {
            expect(plan.maxLifetimePayouts).toBe(5);
            expect(plan.isAccountConcluded(4)).toBe(false);
            expect(plan.isAccountConcluded(5)).toBe(true);
        },
    );

    it("caps contracts flat at 4, both eval and funded (live-verified 2026-09-14 against helpfutures.e8markets.com's 'Max. available Contract Sizes')", () => {
        expect(plan.contractLimits?.evalMinis).toBe(4);
        expect(plan.contractLimits?.evalMicros).toBe(4);
        const funded = plan.contractLimits?.fundedMinis;
        if (funded?.kind !== ContractLimitKind.Flat) {
            throw new Error('expected a flat funded contract limit');
        }
        expect(funded.maxContracts).toBe(4);
    });

    it(
        'has no explicit day-count gate on the first payout, but still requires 5 profitable days between every payout after ' +
            "(corrected 2026-09-18: 'What is Payout On Demand?' and 'Everything about Payouts' both state the old '3 days for the first payout' figure was never a separate rule, only how the 35% Best Day Rule's own math happens to work out; live-verified against helpfutures.e8markets.com)",
        () => {
            expect(plan.minDaysAfterPassForPayout).toBe(0);
            expect(plan.minDaysAfterPassForPayoutPerCycle).toBe(5);
            expect(plan.minQualifyingDayProfit).toBe(150);

            const state = plan.initialState();
            state.threshold = state.startingBalance;
            state.thresholdLocked = true;
            const tracker = newFundedCycleTracker(state);
            state.balance = state.startingBalance + 10_000;

            state.qualifyingDays = 0;
            const firstPayout = tryFundedPayout({
                maxPayouts: Infinity,
                minRetainedCushion: 0,
                payoutRequestSize: undefined,
                plan,
                state,
                tracker,
            });
            expect(firstPayout).not.toBeNull();
            expect(tracker.payoutsIssued).toBe(1);

            state.balance += 3000;
            state.qualifyingDays += 4;
            expect(
                tryFundedPayout({
                    maxPayouts: Infinity,
                    minRetainedCushion: 0,
                    payoutRequestSize: undefined,
                    plan,
                    state,
                    tracker,
                }),
            ).toBeNull();

            state.qualifyingDays += 1;
            const secondPayout = tryFundedPayout({
                maxPayouts: Infinity,
                minRetainedCushion: 0,
                payoutRequestSize: undefined,
                plan,
                state,
                tracker,
            });
            expect(secondPayout).not.toBeNull();
        },
    );

    it('the $1,000 daily pause locks the day out once funded, without busting the account, and does not apply during the eval', () => {
        const evalState = plan.initialState();
        evalState.balance -= 1000;
        evalState.todayPnL = -1000;
        expect(plan.isDayLockedOut(evalState, TradingPhase.Eval)).toBe(false);
        expect(plan.isBust(evalState, TradingPhase.Eval)).toBe(false);

        const fundedState = plan.initialState();
        fundedState.balance -= 1000;
        fundedState.todayPnL = -1000;
        expect(plan.isDayLockedOut(fundedState, TradingPhase.Funded)).toBe(
            true,
        );
        expect(plan.isBust(fundedState, TradingPhase.Funded)).toBe(false);
    });
});

describe('E8 Zero (MAX/Starter x 80%/100% payout) 50K', () => {
    it('registers all 4 variants alongside Signature (5 E8 Futures plans total)', () => {
        const firm = new E8Futures();
        expect(firm.plans).toHaveLength(5);
        for (const variant of [
            E8FuturesVariant.Signature,
            E8FuturesVariant.ZeroMax80,
            E8FuturesVariant.ZeroMax100,
            E8FuturesVariant.ZeroStarter80,
            E8FuturesVariant.ZeroStarter100,
        ]) {
            expect(
                firm.findPlan({
                    accountSize: 50_000,
                    firm: FirmId.E8Futures,
                    variant,
                }),
            ).toBeDefined();
        }
    });

    it('caps funded accounts at 3, lower than Signature\'s 5 (live-verified against help.e8markets.com\'s "How many accounts can I apply for at once?")', () => {
        expect(
            findE8ZeroPlan(E8FuturesVariant.ZeroMax80).maxFundedAccounts,
        ).toBe(3);
        expect(
            findE8ZeroPlan(E8FuturesVariant.ZeroMax100).maxFundedAccounts,
        ).toBe(3);
        expect(
            findE8ZeroPlan(E8FuturesVariant.ZeroStarter80).maxFundedAccounts,
        ).toBe(3);
        expect(
            findE8ZeroPlan(E8FuturesVariant.ZeroStarter100).maxFundedAccounts,
        ).toBe(3);
        expect(plan.maxFundedAccounts).toBe(5);
    });

    it('applies the 40% consistency rule to the challenge/eval stage only, the reverse of Signature', () => {
        const zero = findE8ZeroPlan(E8FuturesVariant.ZeroMax80);
        const evalRule = zero.evalConsistencyRule();
        expect(evalRule?.scope).toBe(ConsistencyScope.Eval);
        expect(evalRule?.maxBestDayShare).toBe(0.4);
        expect(zero.fundedConsistencyRule()).toBeNull();
    });

    it(
        'matches the live-verified $1,500 drawdown and $3,000 target on both stages, but only the funded-stage floor locks ' +
            "(fixed 2026-09-18: the challenge-stage EOD Dynamic Drawdown was previously locking too, contradicting the plan's own article: 'In challange stage of E8 Zero, the Eod Drawdown scales with your profit... the loss level is not being locked at the initial balance and can go further')",
        () => {
            const zero = findE8ZeroPlan(E8FuturesVariant.ZeroMax80);
            expect(zero.drawdown.kind).toBe(DrawdownKind.EodTrailing);
            expect(zero.drawdown.amount).toBe(1500);
            expect(zero.drawdown.lock).toBeUndefined();
            expect(zero.fundedDrawdown.kind).toBe(DrawdownKind.EodTrailing);
            expect(zero.fundedDrawdown.amount).toBe(1500);
            expect(zero.fundedDrawdown.lock?.atProfit).toBe(1500);
            expect(zero.fundedDrawdown.lock?.lockedThreshold(50_000)).toBe(
                50_000,
            );
            expect(zero.profitTarget).toBe(3000);
            expect(
                zero.isDayLockedOut(zero.initialState(), TradingPhase.Eval),
            ).toBe(false);
        },
    );

    it('prices MAX above Starter, and 100% payout above 80%, at $50K', () => {
        const maxEighty = findE8ZeroPlan(E8FuturesVariant.ZeroMax80);
        const maxHundred = findE8ZeroPlan(E8FuturesVariant.ZeroMax100);
        const starterEighty = findE8ZeroPlan(E8FuturesVariant.ZeroStarter80);
        const starterHundred = findE8ZeroPlan(E8FuturesVariant.ZeroStarter100);

        expect(maxEighty.fees.oneTimeEval).toBe(214);
        expect(maxHundred.fees.oneTimeEval).toBe(279);
        expect(starterEighty.fees.oneTimeEval).toBe(116);
        expect(starterHundred.fees.oneTimeEval).toBe(149);

        expect(maxEighty.payoutFromProfit(1000)).toBeCloseTo(800, 6);
        expect(maxHundred.payoutFromProfit(1000)).toBeCloseTo(1000, 6);

        expect(maxEighty.payoutRequestCap).toBe(3000);
        expect(starterEighty.payoutRequestCap).toBe(1000);
    });

    it('scales the funded contract limit 2 -> 3 -> 5 with profit, matching the live account-profit tiers', () => {
        const zero = findE8ZeroPlan(E8FuturesVariant.ZeroMax80);
        const funded = zero.contractLimits?.fundedMinis;
        if (funded?.kind !== ContractLimitKind.Tiered) {
            throw new Error('expected a tiered funded contract limit');
        }
        expect(maxContractsAt(funded, 0)).toBe(2);
        expect(maxContractsAt(funded, 749)).toBe(2);
        expect(maxContractsAt(funded, 750)).toBe(3);
        expect(maxContractsAt(funded, 1499)).toBe(3);
        expect(maxContractsAt(funded, 1500)).toBe(5);
        expect(zero.contractLimits?.evalMinis).toBe(4);
        expect(zero.contractLimits?.evalMicros).toBe(4);
    });

    it('funds daily with a $100 floor and no qualifying-day gate, unlike Signature', () => {
        const zero = findE8ZeroPlan(E8FuturesVariant.ZeroMax80);
        expect(zero.minDaysAfterPassForPayout).toBe(0);
        expect(zero.minPayoutRequest).toBe(100);
        expect(zero.minPayoutProfit).toBe(100);
        expect(zero.minPayoutProfitPerCycle).toBe(100);
        expect(zero.minQualifyingDayProfit).toBeNull();
    });

    it('locks the drawdown floor to breakeven on the first payout, before profit reaches the $1,500 natural lock threshold', () => {
        const zero = findE8ZeroPlan(E8FuturesVariant.ZeroMax80);
        expect(zero.payoutFloorEffect).toBe(PayoutFloorEffect.LockAtPlanFloor);

        const state = zero.initialState();
        state.balance = state.startingBalance + 300;
        state.threshold = state.balance - 1500;
        state.thresholdLocked = false;
        state.qualifyingDays = 0;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: zero,
            state,
            tracker,
        });

        expect(payout).not.toBeNull();
        expect(state.thresholdLocked).toBe(true);
        expect(state.threshold).toBe(state.startingBalance);
    });
});
