import { describe, expect, it } from 'vitest';

import {
    applyPayoutFloorEffect,
    ceilToWholeCents,
    createInitialLiveAccountState,
    dollars,
    type DrawdownState,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    LivePlan,
    MffuVariant,
    newFundedCycleTracker,
    nonNegativeDollarsSchema,
    PayoutFloorEffect,
    type Plan,
    type PlanId,
    postPayoutThreshold,
    serializePlanId,
    TopStepVariant,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';

const START = 50_000;
const LOCKED_FLOOR = START + 100;
const EFFECTS = Object.values(PayoutFloorEffect);

function drawdownState(
    threshold: number,
    isThresholdLocked = false,
): DrawdownState {
    return {
        balance: START + 3000,
        startingBalance: START,
        threshold,
        thresholdLocked: isThresholdLocked,
    };
}

function lockingDrawdown(): EodTrailingDrawdown {
    return new EodTrailingDrawdown({
        amount: dollars(2000),
        lock: {
            atProfit: dollars(2100),
            lockedThreshold: (start) => start + 100,
        },
    });
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

describe('postPayoutThreshold: one post-payout floor for the funded tracker and the live plans', () => {
    it.each([
        {
            expected: {
                [PayoutFloorEffect.LockAtPlanFloor]: LOCKED_FLOOR,
                [PayoutFloorEffect.MoveToLockedFloor]: LOCKED_FLOOR,
                [PayoutFloorEffect.None]: 49_000,
                [PayoutFloorEffect.ReleaseFloor]: START,
            } satisfies Record<PayoutFloorEffect, number>,
            threshold: 49_000,
            title: 'an unlocked floor below the lock level',
        },
        {
            expected: {
                [PayoutFloorEffect.LockAtPlanFloor]: 51_000,
                [PayoutFloorEffect.MoveToLockedFloor]: LOCKED_FLOOR,
                [PayoutFloorEffect.None]: 51_000,
                [PayoutFloorEffect.ReleaseFloor]: START,
            } satisfies Record<PayoutFloorEffect, number>,
            threshold: 51_000,
            title: 'an unlocked floor above the lock level',
        },
    ])('maps every PayoutFloorEffect for $title', ({ expected, threshold }) => {
        for (const effect of EFFECTS) {
            expect(
                postPayoutThreshold(
                    lockingDrawdown(),
                    drawdownState(threshold),
                    effect,
                    START,
                ),
                effect,
            ).toBe(expected[effect]);
        }
    });

    it('keeps an already locked floor for the lock effects and releases to the target', () => {
        const state = drawdownState(49_500, true);
        expect(
            postPayoutThreshold(
                lockingDrawdown(),
                state,
                PayoutFloorEffect.LockAtPlanFloor,
                START,
            ),
        ).toBe(49_500);
        expect(
            postPayoutThreshold(
                lockingDrawdown(),
                state,
                PayoutFloorEffect.MoveToLockedFloor,
                START,
            ),
        ).toBe(49_500);
        expect(
            postPayoutThreshold(
                lockingDrawdown(),
                state,
                PayoutFloorEffect.ReleaseFloor,
                START,
            ),
        ).toBe(START);
    });

    it('keeps the current floor for every non-release effect when there is no drawdown', () => {
        for (const effect of EFFECTS) {
            expect(
                postPayoutThreshold(null, drawdownState(49_000), effect, START),
                effect,
            ).toBe(effect === PayoutFloorEffect.ReleaseFloor ? START : 49_000);
        }
    });

    it('moves the floor to exactly the reported threshold when the effect is applied', () => {
        for (const effect of EFFECTS) {
            for (const threshold of [49_000, 51_000]) {
                const state = drawdownState(threshold);
                const expected = postPayoutThreshold(
                    lockingDrawdown(),
                    state,
                    effect,
                    START,
                );
                applyPayoutFloorEffect(lockingDrawdown(), state, effect, START);
                expect(state.threshold, `${effect} ${threshold}`).toBe(
                    expected,
                );
                expect(state.thresholdLocked, effect).toBe(
                    effect !== PayoutFloorEffect.None,
                );
            }
        }
    });
});

describe('the funded tracker settles a payout onto the shared post-payout floor (pins unchanged)', () => {
    it.each([
        {
            debited: 2000,
            effect: PayoutFloorEffect.LockAtPlanFloor,
            threshold: 51_000,
        },
        {
            debited: 2900,
            effect: PayoutFloorEffect.MoveToLockedFloor,
            threshold: LOCKED_FLOOR,
        },
        { debited: 2000, effect: PayoutFloorEffect.None, threshold: 51_000 },
        {
            debited: 2000,
            effect: PayoutFloorEffect.ReleaseFloor,
            threshold: START,
        },
    ])(
        'MFF Rapid EOD with $effect pays $debited and leaves the floor at $threshold',
        ({ debited, effect, threshold }) => {
            const plan = registryPlan({
                accountSize: START,
                firm: FirmId.Mffu,
                variant: MffuVariant.RapidEod,
            }).withOverrides({ payoutFloorEffect: effect });
            const state = plan.initialState();
            plan.beginFundedPhase(state);
            state.balance = START + 3000;
            state.threshold = 51_000;
            state.thresholdLocked = false;
            state.qualifyingDays = 99;
            const tracker = newFundedCycleTracker(state);
            tracker.lastPayoutBalance = START;
            tracker.qualifyingDaysAtLastPayout = 0;
            const before = structuredClone(state);

            const payout = tracker.tryPayout({
                minRetainedCushion: 0,
                payoutRequestSize: undefined,
                plan,
                state,
            });

            expect(payout?.debited).toBe(debited);
            expect(state.threshold).toBe(threshold);
            expect(state.threshold).toBe(
                postPayoutThreshold(
                    plan.fundedDrawdown,
                    before,
                    effect,
                    plan.accountSize,
                ),
            );
        },
    );

    it('keeps withdrawableNow on the current floor for TopStep ReleaseFloor (Q13 default), while the shared helper gives the advice path the released floor', () => {
        const plan = registryPlan({
            accountSize: START,
            firm: FirmId.TopStep,
            variant: TopStepVariant.StandardStandard,
        });
        expect(plan.payoutFloorEffect).toBe(PayoutFloorEffect.ReleaseFloor);
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        state.balance = 51_200;
        state.threshold = 49_200;
        state.qualifyingDays = 99;
        const tracker = newFundedCycleTracker(state);

        expect(
            tracker.withdrawableNow({
                minRetainedCushion: 1000,
                plan,
                state,
            }),
        ).toBe(600);
        expect(
            state.balance -
                postPayoutThreshold(
                    plan.fundedDrawdown,
                    state,
                    plan.payoutFloorEffect,
                    plan.accountSize,
                ) -
                1000,
        ).toBe(200);
    });
});

describe('LivePlan withdraws onto the shared post-payout floor (pins unchanged)', () => {
    it.each([
        {
            effect: PayoutFloorEffect.LockAtPlanFloor,
            threshold: 400,
            withdrawable: 2099.99,
        },
        {
            effect: PayoutFloorEffect.MoveToLockedFloor,
            threshold: 100,
            withdrawable: 2399.99,
        },
        {
            effect: PayoutFloorEffect.None,
            threshold: 400,
            withdrawable: 2099.99,
        },
        {
            effect: PayoutFloorEffect.ReleaseFloor,
            threshold: 0,
            withdrawable: 2499.99,
        },
    ])(
        '$effect withdraws $withdrawable and leaves the floor at $threshold',
        ({ effect, threshold, withdrawable }) => {
            const drawdown = new EodTrailingDrawdown({
                amount: dollars(2000),
                lock: {
                    atProfit: dollars(2000),
                    lockedThreshold: (start) => start + 100,
                },
            });
            const plan = new LivePlan({
                cushionPercent: {
                    postLock: fraction(0.1),
                    preLock: fraction(0.05),
                },
                label: 'Test Live',
                liveDailyLossLimit: null,
                liveDrawdown: drawdown,
                payoutFloorEffect: effect,
                payoutTiers: [
                    { thresholdProfit: dollars(0), traderShare: fraction(0.9) },
                ],
                requiresLockForWithdrawal: false,
            });
            const state = createInitialLiveAccountState(0, 400);
            state.balance = 2500;
            const before = structuredClone(state);

            const amount = plan.withdrawableAmount(state, dollars(0));
            plan.withdraw(state, amount);

            expect(amount).toBe(withdrawable);
            expect(state.threshold).toBe(threshold);
            expect(state.threshold).toBe(
                postPayoutThreshold(drawdown, before, effect, 0),
            );
        },
    );
});

describe('core units for payout amounts', () => {
    it('rounds up to whole cents within the cent tolerance', () => {
        expect(ceilToWholeCents(1.001)).toBe(1.01);
        expect(ceilToWholeCents(0.1 + 0.2)).toBe(0.3);
        expect(ceilToWholeCents(2)).toBe(2);
        expect(ceilToWholeCents(199.994)).toBe(200);
        expect(ceilToWholeCents(-1.005)).toBe(-1);
    });

    it('accepts only non-negative finite dollars', () => {
        expect(nonNegativeDollarsSchema.parse(0)).toBe(0);
        expect(nonNegativeDollarsSchema.parse(12.5)).toBe(12.5);
        for (const bad of [-0.01, NaN, Infinity]) {
            expect(
                nonNegativeDollarsSchema.safeParse(bad).success,
                String(bad),
            ).toBe(false);
        }
    });
});
