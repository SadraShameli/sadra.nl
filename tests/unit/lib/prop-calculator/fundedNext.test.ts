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

    it('Rapid Daily has no contract limit modeled (unconfirmed, deliberately left unset)', () => {
        const plan = planFor(FundedNextVariant.RapidDaily);
        expect(plan.contractLimits).toBeNull();
    });
});
