import { describe, expect, it } from 'vitest';

import {
    ContractLimitKind,
    DailyLossLimitKind,
    DailyLossLimitShape,
    describeDailyLossLimit,
    DrawdownKind,
    FirmId,
    LucidVariant,
    maxContractsAt,
    resolveContractLimit,
    resolveDailyLossLimit,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import {
    newFundedCycleTracker,
    tryFundedPayout,
} from '~/lib/prop-calculator/core/FundedPayoutCycle';
import { LucidTrading } from '~/lib/prop-calculator/firms/lucid/LucidTrading';

const lucid = new LucidTrading();

function lucidPlan(variant: LucidVariant) {
    const plan = lucid.findPlan({
        accountSize: 50_000,
        firm: FirmId.Lucid,
        variant,
    });
    if (!plan) throw new Error(`lucid ${variant} missing`);
    return plan;
}

const pro = lucidPlan(LucidVariant.Pro);
const flex = lucidPlan(LucidVariant.Flex);

describe('LucidPro recurring per-cycle profit goal (support.lucidtrading.com LucidPro Payouts: $500 at the 50K tier, resets after each payout)', () => {
    it('models the confirmed $500 figure instead of leaving the field unset', () => {
        expect(pro.minPayoutProfitPerCycle).toBe(500);
    });

    it('sets the funded consistency rule to the 40% confirmed by both the marketing page and an independent third-party verifier', () => {
        expect(pro.fundedConsistencyRule()?.maxBestDayShare).toBe(0.4);
    });

    it('denies a payout after the first when cycle profit is below the $500 goal, even with ample cushion room and a full ladder step available', () => {
        const state = pro.initialState();
        state.balance = state.startingBalance + 10_000;
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        const tracker = newFundedCycleTracker(state);
        tracker.payoutsIssued = 1;
        tracker.lastPayoutBalance = state.balance - 200;
        tracker.qualifyingDaysAtLastPayout = 0;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: pro,
            state,
            tracker,
        });

        expect(payout).toBeNull();
    });

    it('clears the gate once cycle profit reaches the $500 goal', () => {
        const state = pro.initialState();
        state.balance = state.startingBalance + 10_000;
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        const tracker = newFundedCycleTracker(state);
        tracker.payoutsIssued = 1;
        tracker.lastPayoutBalance = state.balance - 500;
        tracker.qualifyingDaysAtLastPayout = 0;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: pro,
            state,
            tracker,
        });

        expect(payout).not.toBeNull();
        expect(payout?.debited).toBe(2500);
    });
});

describe("LucidFlex net-positive profit requirement applies to every cycle, first payout included (support.lucidtrading.com LucidFlex Payouts: 'positive net profit (even $1) during each payout cycle')", () => {
    it('sets minPayoutProfit to match minPayoutProfitPerCycle ($0.01) rather than leaving the first cycle free', () => {
        expect(flex.minPayoutProfit).toBe(0.01);
        expect(flex.minPayoutProfitPerCycle).toBe(0.01);
    });

    it('denies the very first payout when the cycle broke exactly even', () => {
        const state = flex.initialState();
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        state.balance = state.startingBalance + 5000;
        const tracker = newFundedCycleTracker(state);
        tracker.qualifyingDaysAtLastPayout = 0;
        tracker.lastPayoutBalance = state.balance;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: flex,
            state,
            tracker,
        });

        expect(payout).toBeNull();
    });

    it('allows the first payout once cycle profit is even one cent positive', () => {
        const state = flex.initialState();
        state.threshold = state.startingBalance + 100;
        state.thresholdLocked = true;
        state.qualifyingDays = 999;
        state.balance = state.startingBalance + 6200;
        const tracker = newFundedCycleTracker(state);
        tracker.qualifyingDaysAtLastPayout = 0;
        tracker.lastPayoutBalance = state.balance - 1200;

        const payout = tryFundedPayout({
            maxPayouts: Infinity,
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: flex,
            state,
            tracker,
        });

        expect(payout).not.toBeNull();
        expect(payout?.debited).toBe(600);
    });
});

describe("LucidFlex funded contract limit scales with simulated profit, unlike the other three plan families (support.lucidtrading.com 'LucidFlex Funded Account Scaling Plan')", () => {
    it('stays flat at 4 mini / 40 micro during eval, matching every other Lucid plan', () => {
        expect(flex.contractLimits?.evalMinis).toBe(4);
        expect(flex.contractLimits?.evalMicros).toBe(40);
    });

    it('ramps 2 -> 3 -> 4 minis (and 20 -> 30 -> 40 micros) as funded simulated profit crosses $1,000 and $2,000', () => {
        const funded = flex.contractLimits?.fundedMinis;
        if (funded?.kind !== ContractLimitKind.Tiered) {
            throw new Error(
                'expected a tiered funded contract limit for LucidFlex',
            );
        }
        expect(maxContractsAt(funded, 0)).toBe(2);
        expect(maxContractsAt(funded, 999)).toBe(2);
        expect(maxContractsAt(funded, 1000)).toBe(3);
        expect(maxContractsAt(funded, 1999)).toBe(3);
        expect(maxContractsAt(funded, 2000)).toBe(4);
        expect(maxContractsAt(funded, 10_000)).toBe(4);

        const fundedMicros = flex.contractLimits?.fundedMicros;
        if (fundedMicros?.kind !== ContractLimitKind.Tiered) {
            throw new Error(
                'expected a tiered funded micro contract limit for LucidFlex',
            );
        }
        expect(maxContractsAt(fundedMicros, 0)).toBe(20);
        expect(maxContractsAt(fundedMicros, 2000)).toBe(40);
    });

    it('resolves via accountProfit (simulated profit), not raw balance, matching the TopStep tiered-limit convention', () => {
        expect(
            resolveContractLimit(
                flex.contractLimits,
                TradingPhase.Funded,
                false,
                1500,
            ),
        ).toBe(3);
        expect(
            resolveContractLimit(
                flex.contractLimits,
                TradingPhase.Eval,
                false,
                1500,
            ),
        ).toBe(4);
    });
});

describe('LucidPro/LucidFlex purchasable Daily Loss Limit toggle (live-verified 2026-09-14 via lucidtrading.com checkout/rules pages, and re-confirmed via a real checkout receipt: OFF or ON at $1,200, identically priced otherwise)', () => {
    const proNoDll = lucidPlan(LucidVariant.ProNoDll);
    const flexDll = lucidPlan(LucidVariant.FlexDll);

    it('ProNoDll has no eval DLL, matching the OFF checkout choice', () => {
        expect(
            describeDailyLossLimit(proNoDll.evalDailyLossLimit),
        ).toStrictEqual({ kind: DailyLossLimitShape.None });
    });

    it("ProNoDll still applies Pro's 60%-of-peak LucidScale DLL once the drawdown floor locks, unaffected by the eval DLL choice", () => {
        expect(
            describeDailyLossLimit(proNoDll.fundedDailyLossLimit),
        ).toStrictEqual({
            after: { kind: DailyLossLimitShape.ShareOfPeak, share: 0.6 },
            before: { kind: DailyLossLimitShape.None },
            kind: DailyLossLimitShape.Staged,
        });
        expect(
            resolveDailyLossLimit(proNoDll.fundedDailyLossLimit, {
                isThresholdLocked: false,
                peakDayCloseProfit: 4000,
                profit: 4000,
            }),
        ).toBeNull();
        expect(
            resolveDailyLossLimit(proNoDll.fundedDailyLossLimit, {
                isThresholdLocked: true,
                peakDayCloseProfit: 4000,
                profit: 4000,
            }),
        ).toBe(2400);
    });

    it('ProNoDll is priced identically to Pro and shares every other rule', () => {
        expect(proNoDll.fees.oneTimeEval).toBe(pro.fees.oneTimeEval);
        expect(proNoDll.fees.reset).toBe(pro.fees.reset);
        expect(proNoDll.profitTarget).toBe(pro.profitTarget);
        expect(proNoDll.drawdown.amount).toBe(pro.drawdown.amount);
        expect(proNoDll.minDaysAfterPassForPayout).toBe(
            pro.minDaysAfterPassForPayout,
        );
        expect(proNoDll.minPayoutProfitPerCycle).toBe(
            pro.minPayoutProfitPerCycle,
        );
    });

    it('FlexDll applies a flat $1,200 DLL to eval', () => {
        expect(
            describeDailyLossLimit(flexDll.evalDailyLossLimit),
        ).toStrictEqual({ amount: 1200, kind: DailyLossLimitShape.Fixed });
    });

    it('FlexDll has no LucidScale scaling component, unlike Pro/ProNoDll -- the funded DLL inherits the same flat $1,200 rule the whole time', () => {
        expect(flexDll.fundedDailyLossLimit.kind).toBe(DailyLossLimitKind.Flat);
        expect(
            describeDailyLossLimit(flexDll.fundedDailyLossLimit),
        ).toStrictEqual({ amount: 1200, kind: DailyLossLimitShape.Fixed });
    });

    it('FlexDll is priced identically to Flex and shares every other rule', () => {
        expect(flexDll.fees.oneTimeEval).toBe(flex.fees.oneTimeEval);
        expect(flexDll.fees.reset).toBe(flex.fees.reset);
        expect(flexDll.profitTarget).toBe(flex.profitTarget);
        expect(flexDll.drawdown.amount).toBe(flex.drawdown.amount);
        expect(flexDll.minDaysAfterPassForPayout).toBe(
            flex.minDaysAfterPassForPayout,
        );
        expect(flexDll.minPayoutProfitPerCycle).toBe(
            flex.minPayoutProfitPerCycle,
        );
    });

    it('Flex (the no-DLL default) is unaffected by the new variants', () => {
        expect(describeDailyLossLimit(flex.evalDailyLossLimit)).toStrictEqual({
            kind: DailyLossLimitShape.None,
        });
        expect(describeDailyLossLimit(flex.fundedDailyLossLimit)).toStrictEqual(
            { kind: DailyLossLimitShape.None },
        );
    });
});

describe('LucidDaily (live-verified 2026-09-14 from lucidtrading.com plan-card markup): four independent drawdown-type x DLL-toggle variants', () => {
    const dailyEod = lucidPlan(LucidVariant.DailyEod);
    const dailyEodDll = lucidPlan(LucidVariant.DailyEodDll);
    const dailyIntraday = lucidPlan(LucidVariant.DailyIntraday);
    const dailyIntradayDll = lucidPlan(LucidVariant.DailyIntradayDll);

    it('matches the live-verified core numbers on every variant', () => {
        for (const plan of [
            dailyEod,
            dailyEodDll,
            dailyIntraday,
            dailyIntradayDll,
        ]) {
            expect(plan.profitTarget).toBe(3000);
            expect(plan.drawdown.amount).toBe(2000);
            expect(plan.evalConsistencyRule()?.maxBestDayShare).toBe(0.5);
            expect(plan.fundedConsistencyRule()).toBeNull();
            expect(plan.minDaysAfterPassForPayout).toBe(0);
        }
    });

    it('EOD and Intraday are separately priced base products, and the DLL toggle costs $20 more when turned OFF', () => {
        expect(dailyEodDll.fees.oneTimeEval).toBe(165);
        expect(dailyEodDll.fees.reset).toBe(115);
        expect(dailyEod.fees.oneTimeEval).toBe(185);
        expect(dailyEod.fees.reset).toBe(115);

        expect(dailyIntradayDll.fees.oneTimeEval).toBe(136);
        expect(dailyIntradayDll.fees.reset).toBe(95);
        expect(dailyIntraday.fees.oneTimeEval).toBe(156);
        expect(dailyIntraday.fees.reset).toBe(95);
    });

    it('has a $0.01 recurring per-cycle profit floor and a $2,100-above-start payout buffer, matching LucidFlex and LucidPro rather than no floor at all', () => {
        for (const plan of [
            dailyEod,
            dailyEodDll,
            dailyIntraday,
            dailyIntradayDll,
        ]) {
            expect(plan.minPayoutProfit).toBe(0.01);
            expect(plan.minPayoutProfitPerCycle).toBe(0.01);
            expect(plan.payoutBuffer).not.toBeNull();
            expect(
                plan.payoutBuffer?.requiredBalance(
                    plan.accountSize,
                    plan.fundedDrawdown.amount,
                ),
            ).toBe(52_100);
        }
    });

    it('the drawdown-type toggle picks a genuinely different DrawdownStrategy', () => {
        expect(dailyEod.drawdown.kind).toBe(DrawdownKind.EodTrailing);
        expect(dailyEodDll.drawdown.kind).toBe(DrawdownKind.EodTrailing);
        expect(dailyIntraday.drawdown.kind).toBe(DrawdownKind.IntradayTrailing);
        expect(dailyIntradayDll.drawdown.kind).toBe(
            DrawdownKind.IntradayTrailing,
        );
    });

    it('the DLL toggle applies independently of the drawdown-type toggle', () => {
        expect(
            describeDailyLossLimit(dailyEod.evalDailyLossLimit),
        ).toStrictEqual({ kind: DailyLossLimitShape.None });
        expect(
            describeDailyLossLimit(dailyIntraday.evalDailyLossLimit),
        ).toStrictEqual({ kind: DailyLossLimitShape.None });
        expect(
            describeDailyLossLimit(dailyEodDll.evalDailyLossLimit),
        ).toStrictEqual({ amount: 1200, kind: DailyLossLimitShape.Fixed });
        expect(
            describeDailyLossLimit(dailyIntradayDll.evalDailyLossLimit),
        ).toStrictEqual({ amount: 1200, kind: DailyLossLimitShape.Fixed });
    });

    it('has the confirmed 4 mini / 40 micro contract limit, both eval and funded', () => {
        for (const plan of [dailyEod, dailyEodDll]) {
            expect(plan.contractLimits?.evalMinis).toBe(4);
            expect(plan.contractLimits?.evalMicros).toBe(40);
            const funded = plan.contractLimits?.fundedMinis;
            if (funded?.kind !== ContractLimitKind.Flat) {
                throw new Error(
                    'expected a flat funded contract limit for LucidDaily',
                );
            }
            expect(funded.maxContracts).toBe(4);
        }
    });
});

describe('LucidDirect (live-verified 2026-09-14 from lucidtrading.com plan-card markup)', () => {
    const direct = lucidPlan(LucidVariant.Direct);

    it('sets minDaysAfterPassForPayout to 5, not 0', () => {
        expect(direct.minDaysAfterPassForPayout).toBe(5);
    });

    it('has the confirmed 4 mini / 40 micro contract limit, both eval and funded', () => {
        expect(direct.contractLimits?.evalMinis).toBe(4);
        expect(direct.contractLimits?.evalMicros).toBe(40);
        const funded = direct.contractLimits?.fundedMinis;
        if (funded?.kind !== ContractLimitKind.Flat) {
            throw new Error(
                'expected a flat funded contract limit for LucidDirect',
            );
        }
        expect(funded.maxContracts).toBe(4);
    });
});

describe('Every Lucid plan now carries the live-confirmed 4 mini / 40 micro contract limit', () => {
    it('sets contractLimits on every registered Lucid plan, none left unrecorded', () => {
        for (const plan of lucid.plans) {
            expect(plan.contractLimits).not.toBeNull();
        }
    });
});
