import { describe, expect, it } from 'vitest';

import {
    ContractLimitKind,
    FirmId,
    FundedNextVariant,
} from '~/lib/prop-calculator/core';
import { TradingPhase } from '~/lib/prop-calculator/core/TradingPhase';
import { FundedNext } from '~/lib/prop-calculator/firms/fundednext/FundedNext';

const firm = new FundedNext();

function planFor(variant: FundedNextVariant) {
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.FundedNext,
        variant,
    });
    if (!plan) throw new Error(`FundedNext ${variant} 50K plan not found`);
    return plan;
}

describe('FundedNext Flex 50K (live-verified 2026-09-14 from fundednext.com)', () => {
    const plan = planFor(FundedNextVariant.Flex);

    it('matches the live-verified core numbers', () => {
        expect(plan.profitTarget).toBe(2500);
        expect(plan.drawdown.amount).toBe(1500);
        expect(plan.evalConsistencyRule()?.maxBestDayShare).toBe(0.4);
        expect(plan.fundedConsistencyRule()).toBeNull();
        expect(plan.fees.oneTimeEval).toBe(69.99);
        expect(plan.fees.reset).toBe(77.99);
        expect(plan.minTradingDays).toBe(0);
        expect(plan.minDaysAfterPassForPayout).toBe(5);
        expect(plan.payoutRequestCap).toBe(1500);
        expect(plan.maxConsecutiveIdleDays).toBe(30);
    });

    it('has the highest trader profit share of any modeled plan (95%)', () => {
        expect(plan.payoutFromProfit(10_000)).toBeCloseTo(9500, 5);
    });

    it('has no eval or funded daily loss limit', () => {
        const evalState = plan.initialState();
        evalState.balance -= 100_000;
        evalState.todayPnL = -100_000;
        expect(plan.isDayLockedOut(evalState, TradingPhase.Eval)).toBe(false);

        const fundedState = plan.initialState();
        fundedState.balance -= 100_000;
        fundedState.todayPnL = -100_000;
        expect(plan.isDayLockedOut(fundedState, TradingPhase.Funded)).toBe(
            false,
        );
    });

    it('models the funded contract limit as 3 minis / 30 micros, matching eval', () => {
        expect(plan.contractLimits?.evalMinis).toBe(3);
        expect(plan.contractLimits?.evalMicros).toBe(30);
        const funded = plan.contractLimits?.fundedMinis;
        if (funded?.kind !== ContractLimitKind.Flat) {
            throw new Error('expected a flat funded contract limit for Flex');
        }
        expect(funded.maxContracts).toBe(3);
    });

    it(
        'requires 5 benchmark days of $200+ profit and caps payouts at 50% of profit (max $1,500), not just a flat request cap ' +
            "(live-verified 2026-09-14 against helpfutures.fundednext.com's Performance Reward eligibility article)",
        () => {
            expect(plan.minQualifyingDayProfit).toBe(200);
            expect(plan.payoutBalanceShareCap).toBe(0.5);
            expect(plan.payoutRequestCap).toBe(1500);
        },
    );
});

describe('FundedNext Legacy/Rapid Pro contract limits (live-verified 2026-09-14)', () => {
    it('Legacy: 3 minis/30 micros eval, 5 minis/50 micros funded', () => {
        const plan = planFor(FundedNextVariant.Legacy);
        expect(plan.contractLimits?.evalMinis).toBe(3);
        expect(plan.contractLimits?.evalMicros).toBe(30);
        const funded = plan.contractLimits?.fundedMinis;
        if (funded?.kind !== ContractLimitKind.Flat) {
            throw new Error('expected a flat funded contract limit for Legacy');
        }
        expect(funded.maxContracts).toBe(5);
    });

    it('Rapid Pro: 4 minis/40 micros, identical eval and funded', () => {
        const plan = planFor(FundedNextVariant.RapidPro);
        expect(plan.contractLimits?.evalMinis).toBe(4);
        expect(plan.contractLimits?.evalMicros).toBe(40);
        const funded = plan.contractLimits?.fundedMinis;
        if (funded?.kind !== ContractLimitKind.Flat) {
            throw new Error(
                'expected a flat funded contract limit for Rapid Pro',
            );
        }
        expect(funded.maxContracts).toBe(4);
    });

    it('Rapid Daily has a confirmed flat 4 mini / 40 micro eval limit, with the funded side deliberately left unconfirmed', () => {
        const plan = planFor(FundedNextVariant.RapidDaily);
        expect(plan.contractLimits?.evalMinis).toBe(4);
        expect(plan.contractLimits?.evalMicros).toBe(40);
        expect(plan.contractLimits?.fundedMinis).toBeNull();
        expect(plan.contractLimits?.fundedMicros).toBeNull();
    });
});

describe('FundedNext FNL:003 50K Instant Account (Labs, no Challenge phase, 20% Perpetual Consistency Rule)', () => {
    const plan = planFor(FundedNextVariant.Fnl003);

    it('skips the Challenge phase entirely and starts the trader directly in the funded stage', () => {
        expect(plan.isInstantFunded).toBe(true);
    });

    it('is a single $50,000 tier with a $149.99 one-time account price and no reset fee', () => {
        expect(plan.accountSize).toBe(50_000);
        expect(plan.fees.oneTimeEval).toBe(149.99);
        expect(plan.fees.reset).toBe(0);
    });

    it('has a flat 3 mini / 30 micro contract limit', () => {
        expect(plan.contractLimits?.evalMinis).toBe(3);
        expect(plan.contractLimits?.evalMicros).toBe(30);
        const funded = plan.contractLimits?.fundedMinis;
        if (funded?.kind !== ContractLimitKind.Flat) {
            throw new Error('expected a flat funded contract limit for FNL:003');
        }
        expect(funded.maxContracts).toBe(3);
    });

    it('locks its $2,000 EOD-trailing drawdown at Initial Balance + $100 ($50,100), the same offset as Flex/Rapid Pro/Rapid Daily', () => {
        const state = plan.initialState();
        expect(state.threshold).toBe(48_000);

        state.balance = 52_100;
        plan.fundedDrawdown.onDayClose(state);

        expect(state.thresholdLocked).toBe(true);
        expect(state.threshold).toBe(50_100);
    });

    it('requires clearing the $2,100-profit buffer ($52,100 balance) before any payout, matching the source\'s own "$2,100 buffer" figure', () => {
        expect(
            plan.payoutBuffer?.requiredBalance(
                plan.accountSize,
                plan.fundedDrawdown.amount,
            ),
        ).toBe(52_100);
    });

    it('requires $2,900 first-cycle profit ($2,100 buffer + the confirmed $800-above-buffer gate) and $800 for every cycle after', () => {
        expect(plan.minPayoutProfit).toBe(2900);
        expect(plan.minPayoutProfitPerCycle).toBe(800);
    });

    it('caps withdrawals between $800 and $1,200, 90% Reward Share, 5 lifetime payouts', () => {
        expect(plan.minPayoutRequest).toBe(800);
        expect(plan.payoutRequestCap).toBe(1200);
        expect(plan.payoutTiers[0]?.traderShare).toBe(0.9);
        expect(plan.maxLifetimePayouts).toBe(5);
    });

    it('caps concurrent accounts at its own 3-account limit, distinct from the other four plans\' shared 5-account allocation', () => {
        expect(plan.maxFundedAccounts).toBe(3);
        const legacy = planFor(FundedNextVariant.Legacy);
        expect(legacy.maxFundedAccounts).toBe(5);
    });

    it('applies a 20% Perpetual Consistency Rule to the funded stage', () => {
        const rule = plan.fundedConsistencyRule();
        expect(rule).not.toBeNull();
        expect(rule?.maxBestDayShare).toBe(0.2);
        expect(rule?.isPerpetual()).toBe(true);
        expect(plan.evalConsistencyRule()).toBeNull();
    });
});
