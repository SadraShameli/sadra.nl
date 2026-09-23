import { describe, expect, it } from 'vitest';

import {
    ContractLimitKind,
    contracts,
    createInitialLiveAccountState,
    DailyLossLimitKind,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    INSTRUMENTS,
    InstrumentSymbol,
    type LiveAccountState,
    LivePlan,
    type LivePlanInit,
    PayoutFloorEffect,
    TierBasis,
} from '~/lib/prop-calculator/core';
import {
    type LiveSeedReserve,
    ReserveLivePlan,
} from '~/lib/prop-calculator/core/LivePlan';
import { LIVE_PLAN_BUILDERS } from '~/lib/prop-calculator/firms';
import { buildApexLivePlan } from '~/lib/prop-calculator/firms/apex/ApexLive';
import { buildMffuRapidLivePlan } from '~/lib/prop-calculator/firms/mffu/MffuRapidLive';

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

const UNLOCKED_EOD_DRAWDOWN = new EodTrailingDrawdown({
    amount: dollars(2000),
});

const TEST_CUSHION_PERCENT = {
    postLock: fraction(0.1),
    preLock: fraction(0.05),
};

function stateAt(overrides: Partial<LiveAccountState> = {}): LiveAccountState {
    return { ...createInitialLiveAccountState(0, -3000), ...overrides };
}

const FLAT_TWO = {
    kind: ContractLimitKind.Flat,
    maxContracts: contracts(2),
} as const;

const FLAT_TWENTY = {
    kind: ContractLimitKind.Flat,
    maxContracts: contracts(20),
} as const;

function invariantStates(plan: LivePlan): LiveAccountState[] {
    const initial = plan.initialState();
    const start = initial.startingBalance;
    const unlockedStates = [
        { ...initial, balance: start + 500 },
        { ...initial, balance: start - 300 },
    ];
    if (plan.liveDrawdown === null) return unlockedStates;
    const locked = plan.liveDrawdown.lock?.lockedThreshold(start) ?? start;
    return [
        ...unlockedStates,
        {
            ...initial,
            balance: locked + 1500,
            threshold: locked,
            thresholdLocked: true,
        },
        {
            ...initial,
            balance: start + 5000,
            threshold: start + 3000,
            thresholdLocked: false,
        },
    ];
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

    it('throws when the minis side of contractLimits is a Tiered config with an empty tiers array', () => {
        expect(
            () =>
                new LivePlan(
                    apexLikeInit({
                        contractLimits: {
                            micros: FLAT_TWENTY,
                            minis: {
                                kind: ContractLimitKind.Tiered,
                                tiers: [],
                            },
                        },
                    }),
                ),
        ).toThrow('Test Live: contractLimits.minis.tiers must not be empty');
    });

    it('throws when the micros side of contractLimits is a Tiered config with an empty tiers array', () => {
        expect(
            () =>
                new LivePlan(
                    apexLikeInit({
                        contractLimits: {
                            micros: {
                                kind: ContractLimitKind.Tiered,
                                tiers: [],
                            },
                            minis: FLAT_TWO,
                        },
                    }),
                ),
        ).toThrow('Test Live: contractLimits.micros.tiers must not be empty');
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
        const plan = new LivePlan(apexLikeInit());

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
                dollars(0),
            ),
        ).toBe(0);
    });

    it('is balance minus the threshold, less the one cent that keeps the account open, for a drawdown-shaped plan once the threshold has locked, when no payoutFloor override is set', () => {
        const plan = new LivePlan(apexLikeInit());

        expect(
            plan.withdrawableAmount(
                stateAt({
                    balance: 250,
                    threshold: 100,
                    thresholdLocked: true,
                }),
                dollars(0),
            ),
        ).toBe(149.99);
    });

    it('is balance-minus-payoutFloor, not balance-minus-threshold, once locked, when a payoutFloor override is set (Apex Live: the $3,100 safety net, not the $100 drawdown-lock floor)', () => {
        const plan = buildApexLivePlan();

        expect(
            plan.withdrawableAmount(
                stateAt({
                    balance: 3750,
                    threshold: 100,
                    thresholdLocked: true,
                }),
                dollars(0),
            ),
        ).toBe(650);
    });

    it('is 0, not negative, when a drawdown-shaped plan is locked but balance has not yet recovered above the threshold', () => {
        const plan = buildApexLivePlan();

        expect(
            plan.withdrawableAmount(
                stateAt({ balance: 50, threshold: 100, thresholdLocked: true }),
                dollars(0),
            ),
        ).toBe(0);
    });

    it('is balance minus the threshold, less one cent, even before the threshold locks, when requiresLockForWithdrawal is false and no payoutFloor is set', () => {
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
                dollars(0),
            ),
        ).toBe(3999.99);
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
                dollars(0),
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
                dollars(0),
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
                dollars(0),
            ),
        ).toBe(0);
    });

    it('is balance minus the $100 the MLL is about to lock to (less one cent), not balance minus the -$1,900 trailing threshold, for a pre-lock Lucid Live LockAtPlanFloor plan, because the payout request itself locks the floor before the money leaves', () => {
        const plan = new LivePlan(lucidLikeInit());

        expect(
            plan.withdrawableAmount(
                stateAt({
                    balance: 1000,
                    threshold: -1900,
                    thresholdLocked: false,
                }),
                dollars(0),
            ),
        ).toBe(899.99);
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
                dollars(0),
            ),
        ).toBe(849.99);
    });

    it('is balance minus the locked threshold (less one cent) once a Lucid Live LockAtPlanFloor plan has locked, unchanged from every other locked drawdown plan', () => {
        const plan = new LivePlan(lucidLikeInit());

        expect(
            plan.withdrawableAmount(
                stateAt({
                    balance: 1000,
                    threshold: 100,
                    thresholdLocked: true,
                }),
                dollars(0),
            ),
        ).toBe(899.99);
    });

    it('is balance minus startingBalance (less one cent) pre-lock for a ReleaseFloor plan, because the request releases the trailing floor back to the starting balance', () => {
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
                dollars(0),
            ),
        ).toBe(999.99);
    });
});

describe('LivePlan retained cushion (D4: keep one full live drawdown by default)', () => {
    it('defaults to one full live drawdown: $3,000 for Apex and $2,000 for MFFU Rapid Live', () => {
        expect(buildApexLivePlan().defaultRetainedCushion()).toBe(3000);
        expect(buildMffuRapidLivePlan().defaultRetainedCushion()).toBe(2000);
    });

    it('defaults to $0 for a daily-loss-limit-shaped plan, which has no trailing floor to protect', () => {
        expect(new LivePlan(dllLikeInit()).defaultRetainedCushion()).toBe(0);
    });

    it('resolves an omitted request to the default and keeps an explicit 0 as drain-to-floor', () => {
        const plan = buildMffuRapidLivePlan();

        expect(plan.resolveRetainedCushion(undefined)).toBe(2000);
        expect(plan.resolveRetainedCushion(0)).toBe(0);
        expect(plan.resolveRetainedCushion(500)).toBe(500);
    });

    it.each([-1, NaN, Infinity])(
        'rejects a retained cushion of %s',
        (requested) => {
            expect(() =>
                buildMffuRapidLivePlan().resolveRetainedCushion(requested),
            ).toThrow(
                /MyFundedFutures Rapid Live: retainedCushion must be a finite number >= 0/,
            );
        },
    );

    it('keeps the retained cushion above the floor once locked: $3,500 over a $100 floor with $3,000 retained leaves $400, and $3,399.99 with none retained', () => {
        const plan = new LivePlan(apexLikeInit());
        const state = stateAt({
            balance: 3500,
            threshold: 100,
            thresholdLocked: true,
        });

        expect(plan.withdrawableAmount(state, dollars(3000))).toBe(400);
        expect(plan.withdrawableAmount(state, dollars(0))).toBe(3399.99);
    });

    it('leaves Apex unchanged: its $3,100 payoutFloor already equals the $100 lock plus the $3,000 default cushion', () => {
        const plan = buildApexLivePlan();
        const state = stateAt({
            balance: 3750,
            threshold: 100,
            thresholdLocked: true,
        });

        expect(plan.withdrawableAmount(state, dollars(3000))).toBe(650);
        expect(plan.withdrawableAmount(state, dollars(0))).toBe(650);
    });

    it('retains the cushion above the starting balance for a daily-loss-limit-shaped plan', () => {
        const plan = new LivePlan(
            dllLikeInit({ startingBalance: dollars(10_000) }),
        );

        expect(
            plan.withdrawableAmount(
                stateAt({ balance: 13_000, startingBalance: 10_000 }),
                dollars(1000),
            ),
        ).toBe(2000);
    });
});

describe('LivePlan payoutFloor never undercuts the bust threshold', () => {
    it('withdraws only down to a trailing threshold that sits above the $0 payoutFloor, keeping one cent above it: $5,000 over a $3,000 threshold gives $1,999.99, not $5,000', () => {
        const plan = new LivePlan(
            apexLikeInit({
                liveDrawdown: UNLOCKED_EOD_DRAWDOWN,
                payoutFloor: dollars(0),
                requiresLockForWithdrawal: false,
            }),
        );

        expect(
            plan.withdrawableAmount(
                stateAt({
                    balance: 5000,
                    threshold: 3000,
                    thresholdLocked: false,
                }),
                dollars(0),
            ),
        ).toBe(1999.99);
    });

    it.each([...LIVE_PLAN_BUILDERS])(
        'never busts the account with a drain-to-floor withdrawal, for %s',
        (_firm, build) => {
            const plan = build({
                postLock: fraction(0.1),
                preLock: fraction(0.05),
            });
            for (const state of invariantStates(plan)) {
                const available = plan.withdrawableAmount(state, dollars(0));
                if (available > 0) plan.withdraw(state, available);

                expect(plan.isBust(state)).toBe(false);
            }
        },
    );

    it('leaves MFFU Rapid Live one cent above its $0 locked Max Loss Limit when draining a post-lock $2,300 balance, instead of exactly on it', () => {
        const plan = buildMffuRapidLivePlan();
        const state = stateAt({
            balance: 2300,
            threshold: 0,
            thresholdLocked: true,
        });

        plan.withdraw(state, plan.withdrawableAmount(state, dollars(0)));

        expect(state.balance).toBeCloseTo(0.01, 10);
        expect(plan.isBust(state)).toBe(false);
    });
});

describe('LivePlan.withdrawableAmount ignores floating-point dust', () => {
    it('returns 0, not an ulp-sized residue, when an EOD ratchet leaves the threshold exactly one retained cushion below the balance', () => {
        const plan = buildMffuRapidLivePlan();
        const balance = 1.1 * 100;
        const state = stateAt({ balance, threshold: balance - 2000 });

        expect(balance - (state.threshold + 2000)).toBeGreaterThan(0);
        expect(
            plan.withdrawableAmount(state, plan.defaultRetainedCushion()),
        ).toBe(0);
    });

    it('still pays a whole cent above the $250 MFFU live minimum', () => {
        const plan = buildMffuRapidLivePlan();

        expect(
            plan.withdrawableAmount(
                stateAt({
                    balance: 2250.01,
                    threshold: 0,
                    thresholdLocked: true,
                }),
                plan.defaultRetainedCushion(),
            ),
        ).toBeCloseTo(250.01, 10);
    });
});

describe('LivePlan default retained cushion fails loud on an unbounded trailing drawdown', () => {
    it('throws for a trailing drawdown with no lock, whose one-drawdown cushion would sit on the peak close forever and never allow a withdrawal', () => {
        const plan = new LivePlan(
            apexLikeInit({
                liveDrawdown: UNLOCKED_EOD_DRAWDOWN,
            }),
        );

        expect(() => plan.defaultRetainedCushion()).toThrow(
            /Test Live: the one-drawdown default retained cushion can never be withdrawn from a trailing drawdown with no lock; pass an explicit retainedCushion/,
        );
        expect(() => plan.resolveRetainedCushion(undefined)).toThrow(
            /Test Live: the one-drawdown default/,
        );
        expect(plan.resolveRetainedCushion(0)).toBe(0);
    });

    it.each([...LIVE_PLAN_BUILDERS])(
        'resolves a default retained cushion without throwing, for %s',
        (_firm, build) => {
            expect(() =>
                build(TEST_CUSHION_PERCENT).defaultRetainedCushion(),
            ).not.toThrow();
        },
    );
});

describe('LivePlan.maxContractsFor', () => {
    it('returns null for every instrument when the plan has no contract limits', () => {
        const plan = new LivePlan(apexLikeInit());

        expect(plan.contractLimits).toBeNull();
        expect(
            plan.maxContractsFor(
                plan.initialState(),
                INSTRUMENTS[InstrumentSymbol.NQ],
            ),
        ).toBeNull();
        expect(
            plan.maxContractsFor(
                plan.initialState(),
                INSTRUMENTS[InstrumentSymbol.MNQ],
            ),
        ).toBeNull();
    });

    it('branches on the instrument: minis for NQ and ES, micros for MNQ', () => {
        const plan = new LivePlan(
            apexLikeInit({
                contractLimits: { micros: FLAT_TWENTY, minis: FLAT_TWO },
            }),
        );
        const state = plan.initialState();

        expect(
            plan.maxContractsFor(state, INSTRUMENTS[InstrumentSymbol.NQ]),
        ).toBe(2);
        expect(
            plan.maxContractsFor(state, INSTRUMENTS[InstrumentSymbol.ES]),
        ).toBe(2);
        expect(
            plan.maxContractsFor(state, INSTRUMENTS[InstrumentSymbol.MNQ]),
        ).toBe(20);
    });
});

describe('LivePlan.maxContractsFor tier selection', () => {
    const tieredMinis = {
        kind: ContractLimitKind.Tiered,
        tiers: [
            { maxContracts: contracts(2), minBalance: dollars(0) },
            { maxContracts: contracts(4), minBalance: dollars(2000) },
        ],
    } as const;

    it('selects the tier from live profit above the starting balance, not the raw balance, for a plan that starts at $2,000', () => {
        const plan = new LivePlan(
            apexLikeInit({
                contractLimits: { micros: FLAT_TWENTY, minis: tieredMinis },
                startingBalance: dollars(2000),
            }),
        );
        const nq = INSTRUMENTS[InstrumentSymbol.NQ];

        expect(plan.maxContractsFor(plan.initialState(), nq)).toBe(2);
        expect(
            plan.maxContractsFor({ ...plan.initialState(), balance: 3999 }, nq),
        ).toBe(2);
        expect(
            plan.maxContractsFor({ ...plan.initialState(), balance: 4000 }, nq),
        ).toBe(4);
    });

    it("honours a tier's session-open basis: $2,500 of profit reached intraday from a $1,500 session open stays on the first tier", () => {
        const plan = new LivePlan(
            apexLikeInit({
                contractLimits: {
                    micros: FLAT_TWENTY,
                    minis: {
                        ...tieredMinis,
                        tierBasis: TierBasis.SessionOpenProfit,
                    },
                },
            }),
        );
        const state = { ...plan.initialState(), balance: 2500, todayPnL: 1000 };

        expect(
            plan.maxContractsFor(state, INSTRUMENTS[InstrumentSymbol.NQ]),
        ).toBe(2);
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
        'leaves balance strictly above the resulting threshold after withdrawing exactly withdrawableAmount(state), for $name, since balance on the threshold is itself a breach and a payout must never push the account into an immediate bust',
        ({ effect }) => {
            const plan = new LivePlan(
                lucidLikeInit({ payoutFloorEffect: effect }),
            );
            const state = stateAt({
                balance: 1000,
                threshold: -1900,
                thresholdLocked: false,
            });

            const available = plan.withdrawableAmount(state, dollars(0));
            plan.withdraw(state, available);

            expect(state.balance).toBeGreaterThan(state.threshold);
            expect(plan.isBust(state)).toBe(false);
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

describe('LivePlan.minPayoutRequest', () => {
    it('defaults to $0, so a plan with no confirmed minimum withdraws any positive amount', () => {
        const plan = new LivePlan(apexLikeInit());

        expect(plan.minPayoutRequest).toBe(0);
        expect(
            plan.withdrawableAmount(
                stateAt({
                    balance: 150,
                    threshold: 100,
                    thresholdLocked: true,
                }),
                dollars(0),
            ),
        ).toBe(49.99);
    });

    it.each([-1, NaN, Infinity])(
        'rejects a minPayoutRequest of %s',
        (minPayoutRequest) => {
            expect(
                () =>
                    new LivePlan(
                        apexLikeInit({
                            minPayoutRequest: dollars(minPayoutRequest),
                        }),
                    ),
            ).toThrow(
                /Test Live: minPayoutRequest must be a finite number >= 0/,
            );
        },
    );

    it('withdraws nothing while the withdrawable amount is below the minimum, and all of it once it reaches the minimum', () => {
        const plan = new LivePlan(
            apexLikeInit({ minPayoutRequest: dollars(500) }),
        );

        expect(
            plan.withdrawableAmount(
                stateAt({
                    balance: 3499,
                    threshold: 100,
                    thresholdLocked: true,
                }),
                dollars(3000),
            ),
        ).toBe(0);
        expect(
            plan.withdrawableAmount(
                stateAt({
                    balance: 3600,
                    threshold: 100,
                    thresholdLocked: true,
                }),
                dollars(3000),
            ),
        ).toBe(500);
    });

    it('applies to a daily-loss-limit-shaped plan too: $120 of profit is not withdrawable under a $125 minimum, $125 is', () => {
        const plan = new LivePlan(
            dllLikeInit({
                minPayoutRequest: dollars(125),
                startingBalance: dollars(10_000),
            }),
        );

        expect(
            plan.withdrawableAmount(
                stateAt({ balance: 10_120, startingBalance: 10_000 }),
                dollars(0),
            ),
        ).toBe(0);
        expect(
            plan.withdrawableAmount(
                stateAt({ balance: 10_125, startingBalance: 10_000 }),
                dollars(0),
            ),
        ).toBe(125);
    });

    it('sizes a request as the requested amount capped by what is withdrawable, and skips it when the capped amount is below the minimum', () => {
        const plan = new LivePlan(
            apexLikeInit({ minPayoutRequest: dollars(500) }),
        );
        const state = stateAt({
            balance: 4000,
            threshold: 100,
            thresholdLocked: true,
        });

        expect(plan.payoutRequestAmount(state, dollars(3000), undefined)).toBe(
            900,
        );
        expect(plan.payoutRequestAmount(state, dollars(3000), 600)).toBe(600);
        expect(plan.payoutRequestAmount(state, dollars(3000), 2000)).toBe(900);
        expect(plan.payoutRequestAmount(state, dollars(3500), 2000)).toBe(0);
    });

    it('accepts an omitted or at-minimum request size and rejects one below the minimum, since it could never be paid', () => {
        const plan = new LivePlan(
            apexLikeInit({ minPayoutRequest: dollars(500) }),
        );

        expect(plan.resolvePayoutRequestSize(undefined)).toBeUndefined();
        expect(plan.resolvePayoutRequestSize(500)).toBe(500);
        expect(() => plan.resolvePayoutRequestSize(499)).toThrow(
            'Test Live: a payout request of $499 is below the $500 minimum payout request, so it could never be paid',
        );
    });

    it.each([NaN, 0, -1, Infinity])(
        'rejects a request size of %s even on a plan with no minimum, since it would never pay',
        (requested) => {
            const plan = new LivePlan(apexLikeInit());

            expect(() => plan.resolvePayoutRequestSize(requested)).toThrow(
                `Test Live: payoutRequestSize must be a finite number > 0 or omitted, got ${requested}`,
            );
        },
    );

    it.each([
        { expected: 500, firm: FirmId.Apex },
        { expected: 100, firm: FirmId.FundedNext },
        { expected: 125, firm: FirmId.TopStep },
        { expected: 0, firm: FirmId.AlphaFutures },
        { expected: 0, firm: FirmId.Lucid },
        { expected: 250, firm: FirmId.Mffu },
        { expected: 0, firm: FirmId.Tpt },
        { expected: 0, firm: FirmId.Tradeify },
    ])(
        'sets $firm to its confirmed live minimum payout request of $expected',
        ({ expected, firm }) => {
            const build = LIVE_PLAN_BUILDERS.get(firm);
            if (!build) throw new Error(`${firm} has no live plan builder`);

            expect(
                build({ postLock: fraction(0.1), preLock: fraction(0.05) })
                    .minPayoutRequest,
            ).toBe(expected);
        },
    );

    it('covers every live plan builder in the minimum payout table above', () => {
        expect(new Set(LIVE_PLAN_BUILDERS.keys())).toEqual(
            new Set([
                FirmId.AlphaFutures,
                FirmId.Apex,
                FirmId.FundedNext,
                FirmId.Lucid,
                FirmId.Mffu,
                FirmId.TopStep,
                FirmId.Tpt,
                FirmId.Tradeify,
            ]),
        );
    });
});

describe('LivePlan winning-day payout gate', () => {
    const GATE = {
        dailyPayoutsAfterWinningDays: 30,
        minWinningDayProfit: dollars(150),
        requestBalanceShareCap: fraction(0.5),
        winningDaysPerRequest: 5,
    };

    it.each([
        { field: 'winningDaysPerRequest', value: 0 },
        { field: 'winningDaysPerRequest', value: 2.5 },
        { field: 'dailyPayoutsAfterWinningDays', value: -1 },
        { field: 'minWinningDayProfit', value: NaN },
        { field: 'requestBalanceShareCap', value: 0 },
        { field: 'requestBalanceShareCap', value: 1.5 },
    ])('rejects $field $value', ({ field, value }) => {
        expect(
            () =>
                new LivePlan(
                    dllLikeInit({
                        winningDayPayoutGate: { ...GATE, [field]: value },
                    }),
                ),
        ).toThrow(/Test DLL Live: winningDayPayoutGate is invalid/);
    });

    it('counts a traded day as a winning day only at or above the minimum day profit', () => {
        const plan = new LivePlan(dllLikeInit({ winningDayPayoutGate: GATE }));
        const state = plan.initialState();

        state.todayPnL = 149.99;
        plan.recordDayClose(state, true);
        expect(state.qualifyingDays).toBe(0);

        state.todayPnL = 150;
        plan.recordDayClose(state, true);
        expect(state.qualifyingDays).toBe(1);

        plan.recordDayClose(state, false);
        expect(state.qualifyingDays).toBe(1);
    });

    it('leaves a plan with no gate withdrawing daily, uncapped', () => {
        const plan = new LivePlan(dllLikeInit());

        expect(
            plan.withdrawableAmount(stateAt({ balance: 1000 }), dollars(0)),
        ).toBe(1000);
    });

    it('records the peak day-close profit and never lowers it', () => {
        const plan = new LivePlan(apexLikeInit());
        const state = stateAt({ balance: 1200 });

        plan.recordDayClose(state, true);
        expect(state.peakDayCloseProfit).toBe(1200);

        state.balance = 800;
        plan.recordDayClose(state, true);
        expect(state.peakDayCloseProfit).toBe(1200);
    });
});

describe('LivePlan MoveToLockedFloor (a lock that fires only on a payout, R1-51)', () => {
    function payoutOnlyInit(overrides: Partial<LivePlanInit> = {}) {
        return lucidLikeInit({
            liveDrawdown: new EodTrailingDrawdown({
                amount: dollars(2000),
                lock: {
                    atProfit: null,
                    lockedThreshold: (start) => start + 100,
                },
            }),
            payoutFloorEffect: PayoutFloorEffect.MoveToLockedFloor,
            ...overrides,
        });
    }

    it('withdraws down to the locked value (less one cent), below a trailed floor, and moves the MLL there', () => {
        const plan = new LivePlan(payoutOnlyInit());
        const state = stateAt({
            balance: 5000,
            threshold: 2500,
            thresholdLocked: false,
        });

        const available = plan.withdrawableAmount(state, dollars(0));
        expect(available).toBe(4899.99);

        plan.withdraw(state, available);

        expect(state.threshold).toBe(100);
        expect(state.thresholdLocked).toBe(true);
        expect(plan.isBust(state)).toBe(false);
    });

    it('throws when the drawdown has no lock config', () => {
        const init = payoutOnlyInit({ liveDrawdown: UNLOCKED_EOD_DRAWDOWN });
        expect(() => new LivePlan(init)).toThrow(
            'Test Lucid Live: payoutFloorEffect is MoveToLockedFloor but liveDrawdown has no lock config',
        );
    });

    it('throws when requiresLockForWithdrawal gates every withdrawal behind the lock', () => {
        expect(
            () =>
                new LivePlan(
                    payoutOnlyInit({ requiresLockForWithdrawal: true }),
                ),
        ).toThrow(
            'Test Lucid Live: payoutFloorEffect is MoveToLockedFloor but requiresLockForWithdrawal gates every withdrawal behind the lock, so the effect could never fire',
        );
    });

    it.each([PayoutFloorEffect.None, PayoutFloorEffect.LockAtPlanFloor])(
        'throws for a lock with no profit trigger under %s',
        (effect) => {
            const init = payoutOnlyInit({ payoutFloorEffect: effect });
            expect(() => new LivePlan(init)).toThrow(/no profit trigger/);
        },
    );
});

function closeReserveSessions(
    plan: ReserveLivePlan,
    state: LiveAccountState,
    dailyPnL: readonly number[],
): void {
    for (const pnl of dailyPnL) {
        state.todayPnL = pnl;
        state.balance += pnl;
        plan.recordDayClose(state, pnl !== 0);
        state.todayPnL = 0;
    }
}

function reservePlan(overrides: Partial<LiveSeedReserve> = {}) {
    return new ReserveLivePlan({
        ...dllLikeInit({ startingBalance: dollars(1000) }),
        seedReserve: {
            amount: dollars(2000),
            depositLagSessions: 2,
            increments: 2,
            profitTargetPerIncrement: dollars(100),
            reviewIntervalSessions: 5,
            ...overrides,
        },
    });
}

describe('ReserveLivePlan seedReserve fails loud on a config that would lose an increment', () => {
    it('rejects depositLagSessions 0: the increment would be scheduled for a session that has already closed and never land', () => {
        expect(() => reservePlan({ depositLagSessions: 0 })).toThrow(
            'Test DLL Live: seedReserve is invalid (depositLagSessions)',
        );
    });

    it('rejects a deposit lag longer than the review interval: the next review could approve while a deposit is pending and overwrite it', () => {
        expect(() =>
            reservePlan({ depositLagSessions: 6, reviewIntervalSessions: 5 }),
        ).toThrow('Test DLL Live: seedReserve is invalid (depositLagSessions)');
    });

    it('releases every increment when the deposit lag equals the review interval', () => {
        const plan = reservePlan({
            depositLagSessions: 5,
            reviewIntervalSessions: 5,
        });
        const state = plan.initialState();

        closeReserveSessions(
            plan,
            state,
            [100, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        );

        expect(state.startingBalance).toBe(3000);
        expect(state.balance).toBe(3200);
    });
});

describe('LivePlan.seedReserveTerms', () => {
    it('is null for a live plan with no seed Reserve', () => {
        expect(new LivePlan(dllLikeInit()).seedReserveTerms()).toBeNull();
    });

    it("is the Reserve plan's own seedReserve config", () => {
        expect(reservePlan().seedReserveTerms()).toStrictEqual({
            amount: 2000,
            depositLagSessions: 2,
            increments: 2,
            profitTargetPerIncrement: 100,
            reviewIntervalSessions: 5,
        });
    });
});
