import { describe, expect, it } from 'vitest';

import {
    ContractLimitKind,
    createInitialLiveAccountState,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    fraction,
    type LiveAccountState,
    LivePlan,
    type LivePlanInit,
    PayoutFloorEffect,
} from '~/lib/prop-calculator/core';
import { buildApexLivePlan } from '~/lib/prop-calculator/firms/apex/ApexLive';

function apexLikeInit(overrides: Partial<LivePlanInit> = {}): LivePlanInit {
    return {
        cushionPercent: { postLock: fraction(0.1), preLock: fraction(0.05) },
        label: 'Test Live',
        liveDailyLossLimit: null,
        liveDrawdown: new EodTrailingDrawdown({
            amount: dollars(3000),
            lock: { atProfit: dollars(3100), lockedThreshold: () => 100 },
        }),
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        ...overrides,
    };
}

function dllLikeInit(overrides: Partial<LivePlanInit> = {}): LivePlanInit {
    return {
        cushionPercent: { postLock: fraction(0.1), preLock: fraction(0.05) },
        label: 'Test DLL Live',
        liveDailyLossLimit: {
            amount: dollars(500),
            kind: DailyLossLimitKind.Flat,
        },
        liveDrawdown: null,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        ...overrides,
    };
}

function lucidLikeInit(overrides: Partial<LivePlanInit> = {}): LivePlanInit {
    return {
        cushionPercent: { postLock: fraction(0.1), preLock: fraction(0.05) },
        label: 'Test Lucid Live',
        liveDailyLossLimit: null,
        liveDrawdown: new EodTrailingDrawdown({
            amount: dollars(2000),
            lock: {
                atProfit: dollars(2000),
                lockedThreshold: (start) => start + 100,
            },
        }),
        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
        ],
        requiresLockForWithdrawal: false,
        ...overrides,
    };
}

function stateAt(overrides: Partial<LiveAccountState> = {}): LiveAccountState {
    return { ...createInitialLiveAccountState(0, -3000), ...overrides };
}

describe('LivePlan constructor invariants (mirroring Plan.ts)', () => {
    it('throws when neither liveDrawdown nor liveDailyLossLimit is set', () => {
        expect(
            () =>
                new LivePlan(
                    apexLikeInit({
                        liveDailyLossLimit: null,
                        liveDrawdown: null,
                    }),
                ),
        ).toThrow('Test Live: must set liveDrawdown or liveDailyLossLimit');
    });

    it('allows both liveDrawdown and liveDailyLossLimit to be set together, for plans like TPT PRO+ Development that need an independent hard-breach drawdown and a soft-breach same-day-pause DLL simultaneously', () => {
        const plan = new LivePlan(
            apexLikeInit({
                liveDailyLossLimit: {
                    amount: dollars(500),
                    kind: DailyLossLimitKind.Flat,
                },
            }),
        );

        expect(plan.liveDrawdown).not.toBeNull();
        expect(plan.liveDailyLossLimit).not.toBeNull();
        expect(plan.isBust(stateAt({ balance: -3000, threshold: -3000 }))).toBe(
            true,
        );
        expect(plan.isDayLockedOut(stateAt({ todayPnL: -500 }))).toBe(true);
    });

    it('throws when payoutTiers is empty', () => {
        expect(() => new LivePlan(apexLikeInit({ payoutTiers: [] }))).toThrow(
            'Test Live: payoutTiers must not be empty',
        );
    });

    it('throws when contractLimit is a Tiered config with an empty tiers array', () => {
        expect(
            () =>
                new LivePlan(
                    apexLikeInit({
                        contractLimit: {
                            kind: ContractLimitKind.Tiered,
                            tiers: [],
                        },
                    }),
                ),
        ).toThrow('Test Live: contractLimit.tiers must not be empty');
    });

    it('throws when maxConsecutiveIdleDays is zero, negative, or non-integer', () => {
        expect(
            () => new LivePlan(apexLikeInit({ maxConsecutiveIdleDays: 0 })),
        ).toThrow(
            'Test Live: maxConsecutiveIdleDays must be a positive integer or omitted, got 0',
        );
        expect(
            () => new LivePlan(apexLikeInit({ maxConsecutiveIdleDays: -1 })),
        ).toThrow();
        expect(
            () => new LivePlan(apexLikeInit({ maxConsecutiveIdleDays: 2.5 })),
        ).toThrow();
    });

    it('does not throw for a valid drawdown-shaped config', () => {
        expect(() => new LivePlan(apexLikeInit())).not.toThrow();
    });

    it('does not throw for a valid daily-loss-limit-shaped config', () => {
        expect(() => new LivePlan(dllLikeInit())).not.toThrow();
    });

    it('throws when payoutFloorEffect is LockAtPlanFloor but the drawdown has no lock config, because a payout request cannot lock a floor the plan never defined', () => {
        const lockless = new EodTrailingDrawdown({ amount: dollars(2000) });

        expect(
            () => new LivePlan(lucidLikeInit({ liveDrawdown: lockless })),
        ).toThrow(
            'Test Lucid Live: payoutFloorEffect is LockAtPlanFloor but liveDrawdown has no lock config',
        );
    });

    it('throws when payoutFloorEffect is LockAtPlanFloor but requiresLockForWithdrawal is true (also the default), because every withdrawal would already sit behind the lock and the lock-on-request effect could never fire', () => {
        expect(
            () =>
                new LivePlan(
                    lucidLikeInit({ requiresLockForWithdrawal: true }),
                ),
        ).toThrow(
            'Test Lucid Live: payoutFloorEffect is LockAtPlanFloor but requiresLockForWithdrawal gates every withdrawal behind the lock, so the effect could never fire',
        );
        expect(
            () =>
                new LivePlan(
                    apexLikeInit({
                        payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
                    }),
                ),
        ).toThrow(
            'Test Live: payoutFloorEffect is LockAtPlanFloor but requiresLockForWithdrawal gates every withdrawal behind the lock, so the effect could never fire',
        );
    });

    it('throws when payoutFloorEffect is ReleaseFloor but liveDrawdown is null, because a daily-loss-limit-shaped plan has no trailing floor to release', () => {
        expect(
            () =>
                new LivePlan(
                    dllLikeInit({
                        payoutFloorEffect: PayoutFloorEffect.ReleaseFloor,
                    }),
                ),
        ).toThrow(
            'Test DLL Live: payoutFloorEffect is ReleaseFloor but liveDrawdown is null',
        );
    });

    it('does not throw for a Lucid Live-shaped LockAtPlanFloor config with requiresLockForWithdrawal false and a locking drawdown', () => {
        expect(() => new LivePlan(lucidLikeInit())).not.toThrow();
    });

    it("throws when payoutFloor and a non-None payoutFloorEffect are both set, because withdraw() would move the threshold to the effect's floor while withdrawableAmount() had already capped the withdrawal at the payoutFloor override, letting balance fall below the effect's floor", () => {
        expect(
            () => new LivePlan(lucidLikeInit({ payoutFloor: dollars(500) })),
        ).toThrow(
            "Test Lucid Live: payoutFloor and a non-None payoutFloorEffect cannot both be set -- withdraw() would move the threshold to the effect's floor while withdrawableAmount() had already capped the withdrawal at the payoutFloor override, letting balance fall below the effect's floor",
        );
        expect(
            () =>
                new LivePlan(
                    lucidLikeInit({
                        payoutFloor: dollars(500),
                        payoutFloorEffect: PayoutFloorEffect.ReleaseFloor,
                    }),
                ),
        ).toThrow(/payoutFloor and a non-None payoutFloorEffect/);
    });

    it("does not throw when payoutFloor is set alongside the default None payoutFloorEffect, matching Apex Live's own $3,100 safety-net configuration", () => {
        expect(
            () => new LivePlan(apexLikeInit({ payoutFloor: dollars(3100) })),
        ).not.toThrow();
    });

    it('defaults payoutFloorEffect to None when omitted, so every existing live plan keeps its payout-never-touches-the-floor behaviour', () => {
        expect(new LivePlan(apexLikeInit()).payoutFloorEffect).toBe(
            PayoutFloorEffect.None,
        );
    });
});

describe('LivePlan.initialState', () => {
    it("starts a drawdown-shaped plan's threshold at startingBalance minus the drawdown amount, matching Apex's $0 - $3,000 = -$3,000", () => {
        const plan = buildApexLivePlan();
        const state = plan.initialState();

        expect(state.balance).toBe(0);
        expect(state.threshold).toBe(-3000);
        expect(state.thresholdLocked).toBe(false);
    });

    it('starts a daily-loss-limit-shaped plan (no trailing floor at all) with threshold 0', () => {
        const plan = new LivePlan(dllLikeInit());
        const state = plan.initialState();

        expect(state.threshold).toBe(0);
    });

    it('threads a nonzero startingBalance into both balance and the drawdown lock reference point, for firms like FundedNext that deposit a starting balance instead of starting at $0', () => {
        const negativeOffsetDrawdown = new EodTrailingDrawdown({
            amount: dollars(2000),
            lock: { atProfit: dollars(1000), lockedThreshold: () => 1000 },
        });
        const plan = new LivePlan(
            apexLikeInit({
                liveDrawdown: negativeOffsetDrawdown,
                startingBalance: dollars(2000),
            }),
        );
        const state = plan.initialState();

        expect(state.balance).toBe(2000);
        expect(state.startingBalance).toBe(2000);
        expect(state.threshold).toBe(0);
    });
});

describe('LivePlan.cushionPercentFor', () => {
    const plan = buildApexLivePlan({
        postLock: fraction(0.1),
        preLock: fraction(0.05),
    });

    it('returns the pre-lock percentage while the threshold has not locked', () => {
        expect(
            plan.cushionPercentFor(stateAt({ thresholdLocked: false })),
        ).toBe(0.05);
    });

    it('returns the post-lock percentage once the threshold has locked', () => {
        expect(plan.cushionPercentFor(stateAt({ thresholdLocked: true }))).toBe(
            0.1,
        );
    });
});

describe('LivePlan.isBust', () => {
    it('is breached once balance falls to or below the trailing threshold, for a drawdown-shaped plan', () => {
        const plan = buildApexLivePlan();

        expect(plan.isBust(stateAt({ balance: -2999, threshold: -3000 }))).toBe(
            false,
        );
        expect(plan.isBust(stateAt({ balance: -3000, threshold: -3000 }))).toBe(
            true,
        );
        expect(plan.isBust(stateAt({ balance: -5000, threshold: -3000 }))).toBe(
            true,
        );
    });

    it('is never breached for a daily-loss-limit-shaped plan, which has no trailing floor to breach', () => {
        const plan = new LivePlan(dllLikeInit());

        expect(
            plan.isBust(stateAt({ balance: -1_000_000, threshold: 0 })),
        ).toBe(false);
    });
});

describe('LivePlan.isDayLockedOut', () => {
    it('is always false when the plan has no daily loss limit', () => {
        const plan = buildApexLivePlan();

        expect(plan.isDayLockedOut(stateAt({ todayPnL: -1_000_000 }))).toBe(
            false,
        );
    });

    it("locks the day out once today's loss reaches the flat daily loss limit", () => {
        const plan = new LivePlan(dllLikeInit());

        expect(plan.isDayLockedOut(stateAt({ todayPnL: -499 }))).toBe(false);
        expect(plan.isDayLockedOut(stateAt({ todayPnL: -500 }))).toBe(true);
        expect(plan.isDayLockedOut(stateAt({ todayPnL: -501 }))).toBe(true);
    });
});

describe('LivePlan.withdrawableAmount', () => {
    it('is 0 for a drawdown-shaped plan before the threshold locks', () => {
        const plan = buildApexLivePlan();

        expect(
            plan.withdrawableAmount(
                stateAt({
                    balance: 1000,
                    threshold: -3000,
                    thresholdLocked: false,
                }),
            ),
        ).toBe(0);
    });

    it('is balance-minus-threshold for a drawdown-shaped plan once the threshold has locked, when no payoutFloor override is set', () => {
        const plan = new LivePlan(apexLikeInit());

        expect(
            plan.withdrawableAmount(
                stateAt({
                    balance: 250,
                    threshold: 100,
                    thresholdLocked: true,
                }),
            ),
        ).toBe(150);
    });

    it('is balance-minus-payoutFloor, not balance-minus-threshold, once locked, when a payoutFloor override is set (Apex Live: the $3,100 safety net, not the $100 drawdown-lock floor)', () => {
        const plan = buildApexLivePlan();

        expect(
            plan.withdrawableAmount(
                stateAt({
                    balance: 3250,
                    threshold: 100,
                    thresholdLocked: true,
                }),
            ),
        ).toBe(150);
    });

    it('is 0, not negative, when a drawdown-shaped plan is locked but balance has not yet recovered above the threshold', () => {
        const plan = buildApexLivePlan();

        expect(
            plan.withdrawableAmount(
                stateAt({ balance: 50, threshold: 100, thresholdLocked: true }),
            ),
        ).toBe(0);
    });

    it('is balance-minus-threshold even before the threshold locks, when requiresLockForWithdrawal is false, matching TPT PRO+\'s confirmed "no buffer zone requirement for withdrawal"', () => {
        const plan = new LivePlan(
            apexLikeInit({ requiresLockForWithdrawal: false }),
        );

        expect(
            plan.withdrawableAmount(
                stateAt({
                    balance: 1000,
                    threshold: -3000,
                    thresholdLocked: false,
                }),
            ),
        ).toBe(4000);
    });

    it('is still 0, not negative, when requiresLockForWithdrawal is false but balance sits below the unlocked threshold', () => {
        const plan = new LivePlan(
            apexLikeInit({ requiresLockForWithdrawal: false }),
        );

        expect(
            plan.withdrawableAmount(
                stateAt({
                    balance: -4000,
                    threshold: -3000,
                    thresholdLocked: false,
                }),
            ),
        ).toBe(0);
    });

    it('is balance-minus-startingBalance for a daily-loss-limit-shaped plan, with no lock gate at all -- there is no floor to protect', () => {
        const plan = new LivePlan(
            dllLikeInit({ startingBalance: dollars(10_000) }),
        );

        expect(
            plan.withdrawableAmount(
                stateAt({
                    balance: 13_000,
                    startingBalance: 10_000,
                    thresholdLocked: false,
                }),
            ),
        ).toBe(3000);
    });

    it('is 0, not negative, for a daily-loss-limit-shaped plan sitting below its starting balance', () => {
        const plan = new LivePlan(
            dllLikeInit({ startingBalance: dollars(10_000) }),
        );

        expect(
            plan.withdrawableAmount(
                stateAt({ balance: 9000, startingBalance: 10_000 }),
            ),
        ).toBe(0);
    });

    it('is balance minus the $100 the MLL is about to lock to, not balance minus the -$1,900 trailing threshold, for a pre-lock Lucid Live LockAtPlanFloor plan, because the payout request itself locks the floor before the money leaves', () => {
        const plan = new LivePlan(lucidLikeInit());

        expect(
            plan.withdrawableAmount(
                stateAt({
                    balance: 1000,
                    threshold: -1900,
                    thresholdLocked: false,
                }),
            ),
        ).toBe(900);
    });

    it('keeps the trailing threshold as the floor pre-lock when it already sits above the $100 lock target, mirroring forceLock only ever raising the threshold', () => {
        const plan = new LivePlan(lucidLikeInit());

        expect(
            plan.withdrawableAmount(
                stateAt({
                    balance: 1000,
                    threshold: 150,
                    thresholdLocked: false,
                }),
            ),
        ).toBe(850);
    });

    it('is balance minus the locked threshold once a Lucid Live LockAtPlanFloor plan has locked, unchanged from every other locked drawdown plan', () => {
        const plan = new LivePlan(lucidLikeInit());

        expect(
            plan.withdrawableAmount(
                stateAt({
                    balance: 1000,
                    threshold: 100,
                    thresholdLocked: true,
                }),
            ),
        ).toBe(900);
    });

    it('is balance minus startingBalance pre-lock for a ReleaseFloor plan, because the request releases the trailing floor back to the starting balance', () => {
        const plan = new LivePlan(
            lucidLikeInit({
                payoutFloorEffect: PayoutFloorEffect.ReleaseFloor,
            }),
        );

        expect(
            plan.withdrawableAmount(
                stateAt({
                    balance: 1000,
                    startingBalance: 0,
                    threshold: -1900,
                    thresholdLocked: false,
                }),
            ),
        ).toBe(1000);
    });
});

describe('LivePlan.withdraw', () => {
    it('debits the balance and force-locks the MLL at startingBalance + $100 for a LockAtPlanFloor plan, encoding Lucid Live\'s "requesting a payout before $2,000 profit locks the Max Loss Limit at $100" rule', () => {
        const plan = new LivePlan(lucidLikeInit());
        const state = stateAt({
            balance: 1000,
            threshold: -1900,
            thresholdLocked: false,
        });

        plan.withdraw(state, 300);

        expect(state.balance).toBe(700);
        expect(state.thresholdLocked).toBe(true);
        expect(state.threshold).toBe(100);
    });

    it('debits the balance and leaves threshold and thresholdLocked untouched for a None plan', () => {
        const plan = new LivePlan(
            lucidLikeInit({ payoutFloorEffect: PayoutFloorEffect.None }),
        );
        const state = stateAt({
            balance: 1000,
            threshold: -1900,
            thresholdLocked: false,
        });

        plan.withdraw(state, 300);

        expect(state.balance).toBe(700);
        expect(state.threshold).toBe(-1900);
        expect(state.thresholdLocked).toBe(false);
    });

    it('debits the balance and releases the threshold to startingBalance, locked, for a ReleaseFloor plan', () => {
        const plan = new LivePlan(
            lucidLikeInit({
                payoutFloorEffect: PayoutFloorEffect.ReleaseFloor,
            }),
        );
        const state = stateAt({
            balance: 1000,
            threshold: -1900,
            thresholdLocked: false,
        });

        plan.withdraw(state, 300);

        expect(state.balance).toBe(700);
        expect(state.threshold).toBe(state.startingBalance);
        expect(state.thresholdLocked).toBe(true);
    });

    it.each([
        { effect: PayoutFloorEffect.LockAtPlanFloor, name: 'LockAtPlanFloor' },
        { effect: PayoutFloorEffect.ReleaseFloor, name: 'ReleaseFloor' },
    ])(
        'never leaves balance below the resulting threshold after withdrawing exactly withdrawableAmount(state), for $name -- the invariant floorAfterWithdrawal exists to guarantee, since a violation here means a payout can push the account into an immediate bust',
        ({ effect }) => {
            const plan = new LivePlan(
                lucidLikeInit({ payoutFloorEffect: effect }),
            );
            const state = stateAt({
                balance: 1000,
                threshold: -1900,
                thresholdLocked: false,
            });

            const available = plan.withdrawableAmount(state);
            plan.withdraw(state, available);

            expect(state.balance).toBeGreaterThanOrEqual(state.threshold);
        },
    );
});

describe('LivePlan.payoutFromProfit', () => {
    it("pays the trader's share of the withdrawn profit, matching Apex's confirmed 90/10 split", () => {
        const plan = buildApexLivePlan();

        expect(plan.payoutFromProfit(1000)).toBeCloseTo(900, 10);
    });

    it('pays nothing for zero or negative profit', () => {
        const plan = buildApexLivePlan();

        expect(plan.payoutFromProfit(0)).toBe(0);
        expect(plan.payoutFromProfit(-500)).toBe(0);
    });
});

describe("LivePlan.transitionPayout (LucidDaily's one-time sim-profit-above-buffer credit)", () => {
    it('defaults to $0 so no firm that never sets it silently gains a one-time credit it has no confirmed rule for', () => {
        expect(new LivePlan(lucidLikeInit()).transitionPayout).toBe(0);
        expect(buildApexLivePlan().transitionPayout).toBe(0);
    });

    it('holds the gross credit only, leaving payoutFromProfit to apply the same 90/10 split every ordinary live withdrawal goes through, so the split lives in exactly one place', () => {
        const plan = new LivePlan(
            lucidLikeInit({ transitionPayout: dollars(1000) }),
        );

        expect(plan.transitionPayout).toBe(1000);
        expect(plan.payoutFromProfit(plan.transitionPayout)).toBeCloseTo(
            900,
            10,
        );
        expect(plan.payoutFromProfit(1000)).toBeCloseTo(900, 10);
    });

    it('never becomes live trading capital: the credit is cash already realized at transition, so the initial balance and trailing floor stay exactly where a plan without one starts them', () => {
        const plan = new LivePlan(
            lucidLikeInit({ transitionPayout: dollars(15_000) }),
        );
        const state = plan.initialState();

        expect(state.balance).toBe(0);
        expect(state.startingBalance).toBe(0);
        expect(state.threshold).toBe(-2000);
    });
});
