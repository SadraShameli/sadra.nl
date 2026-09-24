import { describe, expect, it } from 'vitest';

import {
    ContractLimitKind,
    contracts,
    createInitialState,
    DailyLossLimitBreachEffect,
    DailyLossLimitKind,
    dollars,
    FirmId,
    fraction,
    MffuVariant,
    newFundedCycleTracker,
    PayoutCapScheduleKind,
    PayoutCountTieredPayoutCap,
    PayoutProfitPool,
    percent,
    type Plan,
    type PlanId,
    profitShareMultiplier,
    serializePlanId,
    TierBasis,
    TradingPhase,
    tryFundedPayout,
} from '~/lib/prop-calculator/core';
import {
    AlphaFuturesVariant,
    E8FuturesVariant,
    FtmoFuturesVariant,
    FundedNextVariant,
    LucidVariant,
    TradeifyVariant,
} from '~/lib/prop-calculator/core/PlanId';
import { ALL_FIRMS, findFirm } from '~/lib/prop-calculator/firms';
import { E8Futures } from '~/lib/prop-calculator/firms/e8futures/E8Futures';
import { LucidTrading } from '~/lib/prop-calculator/firms/lucid/LucidTrading';

const lucidDirect = new LucidTrading().findPlan({
    accountSize: 50_000,
    firm: FirmId.Lucid,
    variant: LucidVariant.Direct,
});
if (!lucidDirect) throw new Error('LucidDirect 50K plan not found');

describe('Plan.withMaxLifetimePayouts', () => {
    it(
        'a synthetic 5-step payoutLadder with no capsAtLastStep -- confirms the ' +
            'real trap this method exists to close: clearing only ' +
            'maxLifetimePayouts is NOT enough to uncap the plan. LucidDirect used ' +
            'to be exactly this shape until capsAtLastStep: true was added to its ' +
            "own payoutLadder to match the firm's confirmed no-cap payout policy, " +
            'so this test now builds the trap directly instead of riding a live ' +
            'plan that could get fixed out from under it again',
        () => {
            const trapped = lucidDirect.withOverrides({
                maxLifetimePayouts: undefined,
                payoutLadder: lucidDirect.payoutLadder && {
                    ...lucidDirect.payoutLadder,
                    capsAtLastStep: undefined,
                },
            });
            expect(trapped.maxLifetimePayouts).toBeNull();
            expect(trapped.payoutLadder?.steps.length).toBe(5);
            expect(trapped.payoutLadder?.capsAtLastStep).toBeUndefined();

            const withCap = trapped.withOverrides({
                maxLifetimePayouts: 5,
            });
            expect(withCap.maxLifetimePayouts).toBe(5);

            const halfFixed = withCap.withOverrides({
                maxLifetimePayouts: undefined,
            });
            expect(halfFixed.maxLifetimePayouts).toBeNull();
            expect(halfFixed.isAccountConcluded(50)).toBe(true);
        },
    );

    it('withMaxLifetimePayouts(null) genuinely removes both caps at once', () => {
        const uncapped = lucidDirect.withMaxLifetimePayouts(null);
        expect(uncapped.maxLifetimePayouts).toBeNull();
        expect(uncapped.payoutLadder?.capsAtLastStep).toBe(true);
        expect(uncapped.isAccountConcluded(5)).toBe(false);
        expect(uncapped.isAccountConcluded(50)).toBe(false);
        expect(uncapped.isAccountConcluded(1000)).toBe(false);
    });

    it(
        'withMaxLifetimePayouts(N) caps at exactly N even when N exceeds the ' +
            "ladder's own step count, by also forcing capsAtLastStep so the " +
            'ladder repeats its last step instead of silently exhausting early',
        () => {
            const extended = lucidDirect.withMaxLifetimePayouts(8);
            expect(extended.maxLifetimePayouts).toBe(8);
            expect(extended.isAccountConcluded(7)).toBe(false);
            expect(extended.isAccountConcluded(8)).toBe(true);
            expect(extended.payoutLadder?.capsAtLastStep).toBe(true);
        },
    );

    it('withMaxLifetimePayouts(N) below the ladder length still concludes at N', () => {
        const shortened = lucidDirect.withMaxLifetimePayouts(2);
        expect(shortened.isAccountConcluded(1)).toBe(false);
        expect(shortened.isAccountConcluded(2)).toBe(true);
    });

    it('a plan with no payoutLadder at all is unaffected by the ladder-fix side effect', () => {
        const signature = new E8Futures().findPlan({
            accountSize: 50_000,
            firm: FirmId.E8Futures,
            variant: E8FuturesVariant.Signature,
        });
        if (!signature) throw new Error('E8 Signature 50K plan not found');
        expect(signature.payoutLadder).toBeNull();

        const uncapped = signature.withMaxLifetimePayouts(null);
        expect(uncapped.payoutLadder).toBeNull();
        expect(uncapped.maxLifetimePayouts).toBeNull();
        expect(uncapped.isAccountConcluded(9999)).toBe(false);
    });
});

describe('Plan constructor: minTradingDays invariant', () => {
    it('rejects a negative minTradingDays at construction', () => {
        expect(() => lucidDirect.withOverrides({ minTradingDays: -1 })).toThrow(
            /minTradingDays/,
        );
    });

    it(
        'rejects NaN and fractional minTradingDays values too, matching ' +
            'the error message\'s own "integer" promise',
        () => {
            expect(() =>
                lucidDirect.withOverrides({ minTradingDays: NaN }),
            ).toThrow(/minTradingDays/);
            expect(() =>
                lucidDirect.withOverrides({ minTradingDays: 2.5 }),
            ).toThrow(/minTradingDays/);
        },
    );

    it('accepts zero, the "no minimum trading days" sentinel', () => {
        expect(
            lucidDirect.withOverrides({ minTradingDays: 0 }).minTradingDays,
        ).toBe(0);
    });
});

describe('Plan constructor: maxFundedAccounts invariant (N-13)', () => {
    it.each([0, -1, 2.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
        'rejects a maxFundedAccounts of %s at construction',
        (maxFundedAccounts) => {
            expect(() =>
                lucidDirect.withOverrides({ maxFundedAccounts }),
            ).toThrow(/maxFundedAccounts must be a positive integer/);
        },
    );

    it('names the plan in the error', () => {
        expect(() =>
            lucidDirect.withOverrides({ maxFundedAccounts: 0 }),
        ).toThrow(`${lucidDirect.label}: maxFundedAccounts`);
    });

    it('accepts a positive integer', () => {
        expect(
            lucidDirect.withOverrides({ maxFundedAccounts: 1 })
                .maxFundedAccounts,
        ).toBe(1);
    });

    it('holds for every registered plan', () => {
        for (const firm of ALL_FIRMS) {
            for (const plan of firm.plans) {
                expect(Number.isSafeInteger(plan.maxFundedAccounts)).toBe(true);
                expect(plan.maxFundedAccounts).toBeGreaterThan(0);
            }
        }
    });
});

describe('Plan constructor: fees.undiscountableEval invariant (N-52)', () => {
    it('rejects an undiscountable component larger than the eval price', () => {
        expect(() =>
            lucidDirect.withOverrides({
                fees: {
                    ...lucidDirect.fees,
                    undiscountableEval: dollars(
                        lucidDirect.fees.oneTimeEval + 1,
                    ),
                },
            }),
        ).toThrow(/undiscountableEval/);
    });

    it('rejects a non-finite undiscountable component', () => {
        expect(() =>
            lucidDirect.withOverrides({
                fees: { ...lucidDirect.fees, undiscountableEval: dollars(NaN) },
            }),
        ).toThrow(/undiscountableEval/);
    });

    it('accepts a promo, a negative component', () => {
        expect(
            lucidDirect.withOverrides({
                fees: { ...lucidDirect.fees, undiscountableEval: dollars(-5) },
            }).fees.undiscountableEval,
        ).toBe(-5);
    });
});

describe('Plan constructor: fees.undiscountableReset invariant (N-52 review)', () => {
    it('rejects an undiscountable component larger than the reset price', () => {
        expect(() =>
            lucidDirect.withOverrides({
                fees: {
                    ...lucidDirect.fees,
                    undiscountableReset: dollars(lucidDirect.fees.reset + 1),
                },
            }),
        ).toThrow(/undiscountableReset/);
    });

    it.each([NaN, Infinity, -Infinity])(
        'rejects a non-finite undiscountable reset component (%s)',
        (value) => {
            expect(() =>
                lucidDirect.withOverrides({
                    fees: {
                        ...lucidDirect.fees,
                        undiscountableReset: dollars(value),
                    },
                }),
            ).toThrow(/undiscountableReset/);
        },
    );

    it('accepts a promo, a negative component', () => {
        expect(
            lucidDirect.withOverrides({
                fees: { ...lucidDirect.fees, undiscountableReset: dollars(-5) },
            }).fees.undiscountableReset,
        ).toBe(-5);
    });
});

describe('Plan.isBust: hard vs soft daily loss limit', () => {
    const softDll = lucidDirect.withOverrides({
        evalDailyLossLimit: {
            amount: dollars(1000),
            kind: DailyLossLimitKind.Flat,
        },
        evalDailyLossLimitBreach: undefined,
    });
    const hardDll = softDll.withOverrides({
        evalDailyLossLimitBreach: DailyLossLimitBreachEffect.Terminate,
    });
    const atLimit = () => ({ ...softDll.initialState(), todayPnL: -1000 });

    it(
        'a soft limit stops the day without killing the account, which is the ' +
            'behaviour every firm modeled before hard limits existed and the ' +
            'one FTMO Growth still relies on ("The account is not terminated")',
        () => {
            expect(softDll.isDayLockedOut(atLimit(), TradingPhase.Eval)).toBe(
                true,
            );
            expect(softDll.isBust(atLimit(), TradingPhase.Eval)).toBe(false);
        },
    );

    it(
        'a hard limit kills the account on the same state, because FTMO counts ' +
            'equity merely hitting the limit as a violation, not exceeding it',
        () => {
            expect(hardDll.isDayLockedOut(atLimit(), TradingPhase.Eval)).toBe(
                true,
            );
            expect(hardDll.isBust(atLimit(), TradingPhase.Eval)).toBe(true);
        },
    );

    it('one dollar short of a hard limit is neither locked out nor bust', () => {
        const oneShort = { ...hardDll.initialState(), todayPnL: -999 };
        expect(hardDll.isDayLockedOut(oneShort, TradingPhase.Eval)).toBe(false);
        expect(hardDll.isBust(oneShort, TradingPhase.Eval)).toBe(false);
    });

    it(
        'the drawdown breach still busts on its own, so the added daily-loss ' +
            'clause composes with the drawdown check instead of replacing it',
        () => {
            const drawdownBreached = {
                ...softDll.initialState(),
                balance: softDll.initialState().threshold,
            };
            expect(softDll.isBust(drawdownBreached, TradingPhase.Eval)).toBe(
                true,
            );
            expect(
                softDll.isDayLockedOut(drawdownBreached, TradingPhase.Eval),
            ).toBe(false);
        },
    );

    it('the funded phase inherits the eval breach effect unless it sets its own, mirroring the existing fundedDailyLossLimit fallback', () => {
        expect(hardDll.isDailyLossLimitTerminating(TradingPhase.Funded)).toBe(
            true,
        );
        const softFunded = hardDll.withOverrides({
            fundedDailyLossLimitBreach: DailyLossLimitBreachEffect.Lockout,
        });
        expect(softFunded.isDailyLossLimitTerminating(TradingPhase.Eval)).toBe(
            true,
        );
        expect(
            softFunded.isDailyLossLimitTerminating(TradingPhase.Funded),
        ).toBe(false);
    });

    it('rejects a Terminate breach declared against a limit of None, since there is nothing to breach', () => {
        expect(() =>
            lucidDirect.withOverrides({
                evalDailyLossLimit: { kind: DailyLossLimitKind.None },
                evalDailyLossLimitBreach: DailyLossLimitBreachEffect.Terminate,
                fundedDailyLossLimitBreach: DailyLossLimitBreachEffect.Lockout,
            }),
        ).toThrow(/nothing to breach/);
    });

    it(
        'every plan of every registered firm keeps the Lockout default except ' +
            'FTMO Pro, which is the guard that the new field changed nobody ' +
            "else's modeled behaviour",
        () => {
            const terminating = ALL_FIRMS.flatMap((firm) =>
                firm.plans
                    .filter(
                        (plan) =>
                            plan.isDailyLossLimitTerminating(
                                TradingPhase.Eval,
                            ) ||
                            plan.isDailyLossLimitTerminating(
                                TradingPhase.Funded,
                            ),
                    )
                    .map((plan) => serializePlanId(plan.id)),
            );
            expect(terminating).toStrictEqual(['ftmo-futures-50000-pro']);
        },
    );
});

function registeredPlan(planId: PlanId): Plan {
    const plan = findFirm(planId.firm)?.findPlan(planId);
    if (!plan) throw new Error(`plan not found: ${serializePlanId(planId)}`);
    return plan;
}

const ftmoGrowth = registeredPlan({
    accountSize: 50_000,
    firm: FirmId.FtmoFutures,
    variant: FtmoFuturesVariant.Growth,
});
const ftmoPro = registeredPlan({
    accountSize: 50_000,
    firm: FirmId.FtmoFutures,
    variant: FtmoFuturesVariant.Pro,
});

describe('Plan.payoutCapSchedule', () => {
    it('describes FTMO Growth as a flat 50% of profit, $2,500 per request cap', () => {
        expect(ftmoGrowth.payoutCapSchedule()).toStrictEqual({
            kind: PayoutCapScheduleKind.Flat,
            regime: { balanceShareCap: 0.5, requestCap: 2500 },
        });
    });

    it('describes FTMO Pro as a flat 100% of profit, $5,000 per request cap', () => {
        expect(ftmoPro.payoutCapSchedule()).toStrictEqual({
            kind: PayoutCapScheduleKind.Flat,
            regime: { balanceShareCap: 1, requestCap: 5000 },
        });
    });

    it('describes E8 Signature by payout count and FundedNext Legacy by qualifying days', () => {
        expect(
            registeredPlan({
                accountSize: 50_000,
                firm: FirmId.E8Futures,
                variant: E8FuturesVariant.Signature,
            }).payoutCapSchedule().kind,
        ).toBe(PayoutCapScheduleKind.ByPayoutCount);
        expect(
            registeredPlan({
                accountSize: 50_000,
                firm: FirmId.FundedNext,
                variant: FundedNextVariant.Legacy,
            }).payoutCapSchedule().kind,
        ).toBe(PayoutCapScheduleKind.ByQualifyingDays);
    });

    it('leaves resolvedPayoutCap unchanged for a flat-cap plan', () => {
        expect(
            ftmoGrowth.resolvedPayoutCap(ftmoGrowth.initialState(), 0),
        ).toStrictEqual({ balanceShareCap: 0.5, requestCap: 2500 });
    });
});

describe('Plan.payoutTiersFromPayout: the trader split keyed on payout number', () => {
    const fullShare = [
        { thresholdProfit: dollars(0), traderShare: fraction(1) },
    ];
    const halfShare = [
        { thresholdProfit: dollars(0), traderShare: fraction(0.5) },
    ];

    it('rejects an empty schedule', () => {
        expect(() =>
            ftmoGrowth.withOverrides({ payoutTiersFromPayout: [] }),
        ).toThrow(/payoutTiersFromPayout must not be empty/);
    });

    it('rejects an entry at payout index 0, which belongs to payoutTiers', () => {
        expect(() =>
            ftmoGrowth.withOverrides({
                payoutTiersFromPayout: [
                    { fromPayoutIndex: 0, tiers: halfShare },
                ],
            }),
        ).toThrow(/payout index 1 or later/);
    });

    it('rejects an entry with no tiers', () => {
        expect(() =>
            ftmoGrowth.withOverrides({
                payoutTiersFromPayout: [{ fromPayoutIndex: 1, tiers: [] }],
            }),
        ).toThrow(/must not be empty/);
    });

    it('rejects an entry with two tiers at the same threshold', () => {
        expect(() =>
            ftmoGrowth.withOverrides({
                payoutTiersFromPayout: [
                    {
                        fromPayoutIndex: 1,
                        tiers: [...halfShare, ...halfShare],
                    },
                ],
            }),
        ).toThrow(/more than one tier at thresholdProfit/);
    });

    it('pays the first payout on payoutTiers and later payouts on their scheduled split', () => {
        const plan = ftmoGrowth.withOverrides({
            payoutTiers: fullShare,
            payoutTiersFromPayout: [{ fromPayoutIndex: 1, tiers: halfShare }],
        });
        expect(plan.payoutFromProfit(1000, 0)).toBe(1000);
        expect(plan.payoutFromProfit(1000, 1)).toBe(500);
        expect(plan.payoutFromProfit(1000, 9)).toBe(500);
    });

    it('withScaledTraderShare scales every payout index of the Alpha Futures Standard schedule', () => {
        const standard = registeredPlan({
            accountSize: 50_000,
            firm: FirmId.AlphaFutures,
            variant: AlphaFuturesVariant.Standard,
        });
        const scaled = standard.withScaledTraderShare(fraction(0.8));
        const payouts = [0, 1, 2, 3, 4].map((index) =>
            scaled.payoutFromProfit(1000, index),
        );
        expect(payouts[0]).toBeCloseTo(560, 6);
        expect(payouts[1]).toBeCloseTo(560, 6);
        expect(payouts[2]).toBeCloseTo(640, 6);
        expect(payouts[3]).toBeCloseTo(640, 6);
        expect(payouts[4]).toBeCloseTo(720, 6);
    });
});

describe('Plan.payoutProfitPool AccountProfit invariants', () => {
    const standard = registeredPlan({
        accountSize: 50_000,
        firm: FirmId.AlphaFutures,
        variant: AlphaFuturesVariant.Standard,
    });

    it('rejects AccountProfit combined with payoutProfitShare, which would make the pool dead', () => {
        expect(() =>
            standard.withOverrides({
                payoutProfitShare: profitShareMultiplier(0.5),
            }),
        ).toThrow(
            /payoutProfitShare makes payoutProfitPool AccountProfit dead; set only one/,
        );
    });

    it('never pays principal on an AccountProfit plan with no balance-share cap', () => {
        const uncapped = standard.withOverrides({
            payoutBalanceShareCap: undefined,
            payoutRequestCap: undefined,
        });
        expect(uncapped.payoutProfitPool).toBe(PayoutProfitPool.AccountProfit);
        const state = uncapped.initialState();
        uncapped.beginFundedPhase(state);
        state.balance = state.startingBalance + 1000;
        state.qualifyingDays = 5;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        const payout = tryFundedPayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: uncapped,
            state,
            tracker,
        });

        expect(state.threshold).toBeLessThan(state.startingBalance);
        expect(payout?.debited).toBe(1000);
    });
});

function tradeify(variant: TradeifyVariant): Plan {
    const plan = findFirm(FirmId.Tradeify)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Tradeify,
        variant,
    });
    if (!plan) throw new Error(`Tradeify ${variant} missing`);
    return plan;
}

describe('Plan.purchaseDiscounts (R1-1 bundle discount)', () => {
    it('adds the full 5% bundle at exactly 5 Growth copies', () => {
        expect(
            tradeify(TradeifyVariant.Growth).purchaseDiscounts(undefined, 5),
        ).toStrictEqual({
            activationPercent: percent(0),
            bundlePercent: percent(5),
            evalPercent: percent(0),
        });
    });

    it('returns the discounts unchanged below one bundle and for a plan with no bundle', () => {
        expect(
            tradeify(TradeifyVariant.Growth).purchaseDiscounts(undefined, 4),
        ).toBeUndefined();
        expect(
            tradeify(TradeifyVariant.Lightning).purchaseDiscounts(undefined, 5),
        ).toBeUndefined();
    });

    it('keeps the coupon and averages the bundle over whole bundles of 5 only', () => {
        const coupon = {
            activationPercent: percent(0),
            evalPercent: percent(30),
        };
        expect(
            tradeify(TradeifyVariant.Growth).purchaseDiscounts(coupon, 5),
        ).toStrictEqual({ ...coupon, bundlePercent: percent(5) });
        expect(
            tradeify(TradeifyVariant.Growth).purchaseDiscounts(coupon, 7)
                ?.bundlePercent,
        ).toBeCloseTo((5 * 5) / 7, 12);
        expect(
            tradeify(TradeifyVariant.Growth).purchaseDiscounts(coupon, 10)
                ?.bundlePercent,
        ).toBeCloseTo(5, 12);
    });
});

describe('Plan.purchaseDiscounts with a per-position basket discount (N-32)', () => {
    const basket = tradeify(TradeifyVariant.Lightning).withOverrides({
        basketDiscount: {
            basketSize: 10,
            positions: [
                { percent: fraction(0.15), position: 5 },
                { percent: fraction(0.3), position: 10 },
            ],
        },
    });

    it.each([1, 4])(
        'leaves the discounts unchanged below the first discounted position (%i accounts)',
        (accountCount) => {
            expect(
                basket.purchaseDiscounts(undefined, accountCount),
            ).toBeUndefined();
        },
    );

    it.each([
        [5, 15 / 5],
        [9, 15 / 9],
        [10, 45 / 10],
        [14, 45 / 14],
        [15, 60 / 15],
        [20, 90 / 20],
    ])(
        'averages the discounted positions over %i accounts, repeating per full basket',
        (accountCount, bundlePercent) => {
            expect(
                basket.purchaseDiscounts(undefined, accountCount)
                    ?.bundlePercent,
            ).toBeCloseTo(bundlePercent, 12);
        },
    );

    it('rejects a plan that sets both discount shapes', () => {
        expect(() =>
            tradeify(TradeifyVariant.Growth).withOverrides({
                basketDiscount: {
                    basketSize: 10,
                    positions: [{ percent: fraction(0.15), position: 5 }],
                },
            }),
        ).toThrow(/bulkDiscount and basketDiscount/);
    });

    it.each([
        [{ basketSize: 0, positions: [] }, /basketSize/],
        [{ basketSize: 2.5, positions: [] }, /basketSize/],
        [
            {
                basketSize: 10,
                positions: [{ percent: fraction(0.15), position: 11 }],
            },
            /position/,
        ],
        [
            {
                basketSize: 10,
                positions: [{ percent: fraction(0.15), position: 0 }],
            },
            /position/,
        ],
        [
            {
                basketSize: 10,
                positions: [
                    { percent: fraction(0.15), position: 5 },
                    { percent: fraction(0.3), position: 5 },
                ],
            },
            /position/,
        ],
        [
            {
                basketSize: 10,
                positions: [{ percent: fraction(0), position: 5 }],
            },
            /percent/,
        ],
        [
            {
                basketSize: 10,
                positions: [{ percent: fraction(1.2), position: 5 }],
            },
            /percent/,
        ],
    ])('rejects the malformed basket %o', (basketDiscount, message) => {
        expect(() =>
            tradeify(TradeifyVariant.Lightning).withOverrides({
                basketDiscount,
            }),
        ).toThrow(message);
    });
});

function stateWith(cushion: number, todayPnL: number) {
    const state = createInitialState(50_000, 48_000);
    state.balance = 48_000 + cushion;
    state.todayPnL = todayPnL;
    return state;
}

describe('Plan.affordableRisk', () => {
    const rapidEod = registeredPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });

    it('caps a flat funded daily loss limit at the headroom left today', () => {
        const plan = rapidEod.withOverrides({
            fundedDailyLossLimit: {
                amount: dollars(1000),
                kind: DailyLossLimitKind.Flat,
            },
        });
        expect(
            plan.affordableRisk(stateWith(2000, -300), TradingPhase.Funded, 0),
        ).toBe(700);
        expect(
            plan.affordableRisk(stateWith(500, 0), TradingPhase.Funded, 0),
        ).toBe(500);
    });

    it('leaves room for the round-trip commission under the daily loss limit (N-56)', () => {
        const plan = rapidEod.withOverrides({
            fundedDailyLossLimit: {
                amount: dollars(1000),
                kind: DailyLossLimitKind.Flat,
            },
        });
        expect(
            plan.affordableRisk(stateWith(2000, -300), TradingPhase.Funded, 5),
        ).toBe(695);
        expect(
            plan.affordableRisk(stateWith(500, 0), TradingPhase.Funded, 5),
        ).toBe(500);
    });

    it('returns the whole cushion when the phase has no daily loss limit', () => {
        const plan = rapidEod.withOverrides({
            fundedDailyLossLimit: { kind: DailyLossLimitKind.None },
        });
        expect(
            plan.affordableRisk(stateWith(2000, -300), TradingPhase.Funded, 0),
        ).toBe(2000);
    });

    it('resolves a live-profit tiered limit from balance minus starting balance', () => {
        const plan = rapidEod.withOverrides({
            fundedDailyLossLimit: {
                kind: DailyLossLimitKind.Tiered,
                tiers: [
                    {
                        dailyLossLimit: dollars(300),
                        maxContracts: contracts(1),
                        minProfit: 0,
                    },
                    {
                        dailyLossLimit: dollars(900),
                        maxContracts: contracts(1),
                        minProfit: 1000,
                    },
                ],
            },
        });
        expect(
            plan.affordableRisk(stateWith(2500, 0), TradingPhase.Funded, 0),
        ).toBe(300);
        expect(
            plan.affordableRisk(stateWith(3100, 0), TradingPhase.Funded, 0),
        ).toBe(900);
    });
});

describe('Plan.canLeaveBalanceAbovePayoutFloor', () => {
    const rapidEod = registeredPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });

    it('is false for MFF Rapid EOD, which drains every payout to the floor', () => {
        expect(rapidEod.canLeaveBalanceAbovePayoutFloor()).toBe(false);
    });

    it.each([
        [
            'payoutLadder',
            {
                payoutLadder: {
                    minRequestAmount: dollars(500),
                    steps: [1000],
                },
            },
        ],
        ['payoutRequestCap', { payoutRequestCap: dollars(1000) }],
        ['payoutBalanceShareCap', { payoutBalanceShareCap: fraction(0.5) }],
        [
            'payoutCapOverride',
            {
                payoutCapOverride: new PayoutCountTieredPayoutCap([
                    {
                        fromPayoutIndex: 0,
                        regime: {
                            balanceShareCap: null,
                            requestCap: dollars(1250),
                        },
                    },
                ]),
            },
        ],
        [
            'payoutProfitShare',
            { payoutProfitShare: profitShareMultiplier(0.5) },
        ],
    ] as const)('is true when only %s is set', (_field, overrides) => {
        expect(
            rapidEod.withOverrides(overrides).canLeaveBalanceAbovePayoutFloor(),
        ).toBe(true);
    });
});

describe('Plan.peakSessionCloseBreakpoints', () => {
    function peakTier(minProfit: number, dailyLossLimit: number) {
        return {
            dailyLossLimit: dollars(dailyLossLimit),
            maxContracts: contracts(1),
            minProfit,
        };
    }

    function peakContractTier(minBalance: number, maxContracts: number) {
        return {
            maxContracts: contracts(maxContracts),
            minBalance: dollars(minBalance),
        };
    }

    const unionPlan = lucidDirect.withOverrides({
        contractLimits: {
            evalMicros: contracts(10),
            evalMinis: contracts(1),
            fundedMicros: {
                kind: ContractLimitKind.Tiered,
                tierBasis: TierBasis.PeakSessionCloseProfit,
                tiers: [
                    peakContractTier(0, 10),
                    peakContractTier(2000, 20),
                    peakContractTier(4000, 40),
                ],
            },
            fundedMinis: {
                kind: ContractLimitKind.Tiered,
                tierBasis: TierBasis.PeakSessionCloseProfit,
                tiers: [
                    peakContractTier(-100, 1),
                    peakContractTier(1500, 2),
                    peakContractTier(3000, 4),
                ],
            },
        },
        evalDailyLossLimit: {
            kind: DailyLossLimitKind.Tiered,
            tierBasis: TierBasis.PeakSessionCloseProfit,
            tiers: [peakTier(0, 500), peakTier(750, 900)],
        },
        fundedDailyLossLimit: {
            afterLock: {
                kind: DailyLossLimitKind.Tiered,
                tierBasis: TierBasis.PeakSessionCloseProfit,
                tiers: [peakTier(0, 1000), peakTier(3000, 2000)],
            },
            beforeLock: {
                kind: DailyLossLimitKind.Tiered,
                tierBasis: TierBasis.PeakSessionCloseProfit,
                tiers: [peakTier(-250, 400), peakTier(1000, 800)],
            },
            kind: DailyLossLimitKind.AfterThresholdLock,
        },
    });

    it('unions the funded DLL tiers on both sides of an AfterThresholdLock with the mini contract tiers, deduped, sorted and without the <= 0 floors', () => {
        expect(
            unionPlan.peakSessionCloseBreakpoints(TradingPhase.Funded, false),
        ).toStrictEqual([1000, 1500, 3000]);
    });

    it('reads the micro contract tiers when sizing in micros', () => {
        expect(
            unionPlan.peakSessionCloseBreakpoints(TradingPhase.Funded, true),
        ).toStrictEqual([1000, 2000, 3000, 4000]);
    });

    it('ignores contract tiers when there is no position sizing', () => {
        expect(
            unionPlan.peakSessionCloseBreakpoints(TradingPhase.Funded, null),
        ).toStrictEqual([1000, 3000]);
    });

    it('uses only the eval DLL tiers in the eval, never the funded contract tiers', () => {
        expect(
            unionPlan.peakSessionCloseBreakpoints(TradingPhase.Eval, false),
        ).toStrictEqual([750]);
    });

    it('leaves out tiers on any other basis', () => {
        const sessionOpen = unionPlan.withOverrides({
            contractLimits: {
                evalMicros: contracts(10),
                evalMinis: contracts(1),
                fundedMicros: null,
                fundedMinis: {
                    kind: ContractLimitKind.Tiered,
                    tierBasis: TierBasis.SessionOpenProfit,
                    tiers: [peakContractTier(0, 1), peakContractTier(1500, 2)],
                },
            },
            fundedDailyLossLimit: {
                kind: DailyLossLimitKind.Tiered,
                tierBasis: TierBasis.SessionOpenProfit,
                tiers: [peakTier(0, 1000), peakTier(3000, 2000)],
            },
        });
        expect(
            sessionOpen.peakSessionCloseBreakpoints(TradingPhase.Funded, false),
        ).toStrictEqual([]);
    });
});
