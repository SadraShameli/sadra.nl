import { describe, expect, it } from 'vitest';

import {
    ContractLimitKind,
    FirmId,
    FundedNextVariant,
    initialEvalFee,
    newFundedCycleTracker,
    percent,
    tryFundedPayout,
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
        expect(plan.fees.oneTimeEval).toBe(133.99);
        expect(plan.fees.reset).toBe(77.99);
        expect(plan.minTradingDays).toBe(0);
        expect(plan.minDaysAfterPassForPayout).toBe(5);
        expect(plan.payoutRequestCap).toBe(1500);
        expect(plan.maxConsecutiveIdleDays).toBe(30);
    });

    it('has the highest trader profit share of any modeled plan (95%)', () => {
        expect(plan.payoutFromProfit(10_000, 0)).toBeCloseTo(9500, 5);
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
            throw new Error(
                'expected a flat funded contract limit for FNL:003',
            );
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

    it("caps concurrent accounts at its own 3-account limit, distinct from the other four plans' shared 5-account allocation", () => {
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

describe('FundedNext Legacy payout profit gates (article 14269280, live-fetched 2026-09-23)', () => {
    const plan = planFor(FundedNextVariant.Legacy);

    function postMilestoneState(cycleProfit: number) {
        const state = plan.initialState();
        state.balance = plan.accountSize + 400;
        state.qualifyingDays = 31;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.balance - cycleProfit;
        return { state, tracker };
    }

    function requestPayout(cycleProfit: number, payoutsIssued: number) {
        const { state, tracker } = postMilestoneState(cycleProfit);
        tracker.payoutsIssued = payoutsIssued;
        tracker.qualifyingDaysAtLastPayout = payoutsIssued === 0 ? 0 : 26;
        return tryFundedPayout({
            minRetainedCushion: 0,
            payoutRequestSize: 300,
            plan,
            state,
            tracker,
        });
    }

    it('gates only the second and later withdrawals on $500 cycle profit, not the first', () => {
        expect(plan.minPayoutProfit).toBe(0);
        expect(plan.minPayoutProfitPerCycle).toBe(500);
        expect(plan.minDaysAfterPassForPayout).toBe(5);
        expect(plan.minQualifyingDayProfit).toBe(200);
        expect(plan.minPayoutRequest).toBe(250);
    });

    it('pays a first withdrawal from $400 of cycle profit once the benchmark days are met', () => {
        const { state } = postMilestoneState(400);
        expect(state.threshold).toBe(48_000);
        expect(state.thresholdLocked).toBe(false);

        const result = requestPayout(400, 0);

        expect(result).not.toBeNull();
        expect(result?.debited).toBe(300);
        expect(result?.traderReceives).toBeCloseTo(240, 5);
        expect(result?.causesHardBreach).toBe(false);
    });

    it('still denies a second withdrawal with only $400 of cycle profit', () => {
        expect(requestPayout(400, 1)).toBeNull();
    });

    it('pays a second withdrawal once cycle profit reaches $500', () => {
        const result = requestPayout(500, 1);

        expect(result).not.toBeNull();
        expect(result?.debited).toBe(300);
        expect(result?.causesHardBreach).toBe(false);
    });
});

describe('FundedNext 50K fees are the no-code checkout price (api.fundednext.com checkout API, coupon null, live-called 2026-09-23)', () => {
    const rapidPro = planFor(FundedNextVariant.RapidPro);
    const rapidDaily = planFor(FundedNextVariant.RapidDaily);
    const dllAddOn = planFor(FundedNextVariant.RapidProDllAddOn);
    const flex = planFor(FundedNextVariant.Flex);

    it('prices the Rapid Pro 50K eval at the $299.98 no-code checkout price and keeps its reset at $174.99', () => {
        expect(rapidPro.fees.oneTimeEval).toBe(299.98);
        expect(rapidPro.fees.reset).toBe(174.99);
    });

    it('prices the Rapid Daily 50K eval at the $299.98 no-code checkout price and keeps its reset at $189.99', () => {
        expect(rapidDaily.fees.oneTimeEval).toBe(299.98);
        expect(rapidDaily.fees.reset).toBe(189.99);
    });

    it('prices the Rapid Pro Daily Loss Limit Add-On 50K at $259.98 ($299.98 base minus the $40 add-on) with a $134.99 reset', () => {
        expect(dllAddOn.fees.oneTimeEval).toBe(259.98);
        expect(dllAddOn.fees.reset).toBe(134.99);
        expect(dllAddOn.fees.oneTimeEval).toBeCloseTo(
            rapidPro.fees.oneTimeEval - 40,
            5,
        );
    });

    it('prices the Flex 50K eval at the $133.99 no-code checkout price and keeps its reset at $77.99', () => {
        expect(flex.fees.oneTimeEval).toBe(133.99);
        expect(flex.fees.reset).toBe(77.99);
    });

    it('prices every coupon-affected 50K eval above every RAPID or FNFLEX code price recorded for that plan', () => {
        const flexNoCodePrice = 133.99;
        const codePricesByPlan = [
            { codePrices: [159.99, 174.99], plan: rapidPro },
            { codePrices: [169.99, 189.99], plan: rapidDaily },
            { codePrices: [119.99, 134.99], plan: dllAddOn },
            {
                codePrices: [
                    flexNoCodePrice * (1 - 0.47),
                    flexNoCodePrice * (1 - 0.4),
                ],
                plan: flex,
            },
        ];
        for (const { codePrices, plan } of codePricesByPlan) {
            for (const codePrice of codePrices) {
                expect(plan.fees.oneTimeEval).toBeGreaterThan(codePrice);
            }
        }
    });

    it('keeps a reset cheaper than a no-code re-buy for every coupon-affected 50K plan', () => {
        for (const plan of [rapidPro, rapidDaily, dllAddOn, flex]) {
            expect(plan.fees.oneTimeEval).toBeGreaterThan(plan.fees.reset);
        }
    });

    it('leaves Legacy at $199.99 eval and $183.99 reset', () => {
        const legacy = planFor(FundedNextVariant.Legacy);
        expect(legacy.fees.oneTimeEval).toBe(199.99);
        expect(legacy.fees.reset).toBe(183.99);
    });
});

describe('FundedNext fee and coupon notes stay consistent with the no-code checkout prices', () => {
    const notes = firm.notes;
    const feeNote = notes.find((note) =>
        note.includes('FundedNext 50K fees are the no-code checkout price'),
    );
    const couponNote = notes.find((note) =>
        note.includes('RAPID and FNFLEX are typed coupon codes'),
    );
    const resetNote = notes.find((note) =>
        note.includes('The FundedNext reset fee is not the eval fee'),
    );

    it('cites the checkout API, its no-coupon basis and the call date in the fee note', () => {
        expect(feeNote).toBeDefined();
        expect(feeNote).toContain('api.fundednext.com/api/new-checkout');
        expect(feeNote).toContain('"coupon":null');
        expect(feeNote).toContain('2026-09-23');
        expect(feeNote).toContain('Rapid Pro 50K $299.98');
        expect(feeNote).toContain('Rapid Daily 50K $299.98');
        expect(feeNote).toContain('Flex 50K $133.99');
        expect(feeNote).toContain('$259.98');
    });

    it('explains the reset price ambiguity in the fee note', () => {
        expect(feeNote).toContain('14260538');
        expect(feeNote).toContain('repeat-purchase price');
        expect(feeNote).toContain('behind a login');
    });

    it("calls help article 15877643's $149.99 figure stale in the fee note", () => {
        expect(feeNote).toContain('15877643');
        expect(feeNote).toContain('$149.99');
        expect(feeNote).toContain('stale');
    });

    it('describes RAPID and FNFLEX as typed codes modeled with --eval-discount, citing the offer articles', () => {
        expect(couponNote).toBeDefined();
        expect(couponNote).toContain('16295692');
        expect(couponNote).toContain('first purchase $159.99');
        expect(couponNote).toContain('repeat purchase $174.99');
        expect(couponNote).toContain('15834431');
        expect(couponNote).toContain('--eval-discount');
    });

    it('drops every claim that a coupon is already inside the modeled price', () => {
        for (const note of notes) {
            expect(note).not.toMatch(/already inside/);
            expect(note).not.toContain('non-transactable');
            expect(note).not.toContain('modeled $149.99');
            expect(note).not.toContain('modeled at $149.99');
            expect(note).not.toContain('$69.99 eval fee');
            expect(note).not.toContain('Modeled as $139.99 eval');
        }
    });

    it('points the fee note at the modeled basket discount instead of calling it unmodeled (N-32 review)', () => {
        expect(feeNote).toContain('basketDiscount');
        for (const note of notes) {
            expect(note).not.toContain(
                'it is not modeled (every purchase is charged the single-account price)',
            );
            expect(note).not.toMatch(
                /(bundle|basket) discount[^.]*\bnot modeled\b/,
            );
        }
    });

    it('keeps dollar figures out of the reset-mechanism note so it cannot contradict the fee note', () => {
        expect(resetNote).toBeDefined();
        expect(resetNote).not.toMatch(/\$\d/);
    });
});

describe('FundedNext automatic basket discount: 15% off the 5th and 30% off the 10th account in one basket of up to 10 (checkout API bundle_list, no code, live-called 2026-09-24) (N-32)', () => {
    const basketVariants = [
        FundedNextVariant.Flex,
        FundedNextVariant.Legacy,
        FundedNextVariant.RapidPro,
        FundedNextVariant.RapidProDllAddOn,
        FundedNextVariant.RapidDaily,
    ];

    it.each(basketVariants)(
        '%s carries the per-position basket discount',
        (variant) => {
            expect(planFor(variant).basketDiscount).toStrictEqual({
                basketSize: 10,
                positions: [
                    { percent: 0.15, position: 5 },
                    { percent: 0.3, position: 10 },
                ],
            });
            expect(planFor(variant).bulkDiscount).toBeNull();
        },
    );

    it('FNL:003 has no basket list in the checkout API, so no basket discount', () => {
        expect(planFor(FundedNextVariant.Fnl003).basketDiscount).toBeNull();
    });

    it('averages the 5th-account 15% over the accounts bought, and nothing below 5', () => {
        const rapidPro = planFor(FundedNextVariant.RapidPro);
        expect(rapidPro.purchaseDiscounts(undefined, 4)).toBeUndefined();
        expect(
            rapidPro.purchaseDiscounts(undefined, 5)?.bundlePercent,
        ).toBeCloseTo(3, 12);
        const fiveAccounts =
            5 *
            initialEvalFee(
                rapidPro.fees,
                rapidPro.purchaseDiscounts(undefined, 5),
            );
        expect(fiveAccounts).toBeCloseTo(4 * 299.98 + 299.98 * 0.85, 9);
    });

    it('keeps a typed coupon alongside the basket discount', () => {
        const coupon = {
            activationPercent: percent(0),
            evalPercent: percent(40),
        };
        const discounts = planFor(FundedNextVariant.Flex).purchaseDiscounts(
            coupon,
            5,
        );
        expect(discounts?.evalPercent).toBe(40);
        expect(discounts?.activationPercent).toBe(0);
        expect(discounts?.bundlePercent).toBeCloseTo(3, 12);
    });

    it('notes the basket discount with its source, the 10-account basket, the rounding and the unconfirmed add-on base', () => {
        const basketNote = firm.notes.find((note) =>
            note.includes('bundle_list'),
        );
        expect(basketNote).toBeDefined();
        for (const fact of [
            '15% OFF',
            '30% OFF',
            'purchase_limit',
            '2026-09-24',
            'FNL:003',
            'maxFundedAccounts',
            'Daily Loss Limit Add-On',
            'unconfirmed',
        ]) {
            expect(basketNote).toContain(fact);
        }
        expect(basketNote).not.toContain(String.fromCodePoint(0x20_14));
    });
});
