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

    it('throws when both liveDrawdown and liveDailyLossLimit are set', () => {
        expect(
            () =>
                new LivePlan(
                    apexLikeInit({
                        liveDailyLossLimit: {
                            amount: dollars(500),
                            kind: DailyLossLimitKind.Flat,
                        },
                    }),
                ),
        ).toThrow(
            'Test Live: set only one of liveDrawdown or liveDailyLossLimit',
        );
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

    it('is balance-minus-threshold for a drawdown-shaped plan once the threshold has locked', () => {
        const plan = buildApexLivePlan();

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
