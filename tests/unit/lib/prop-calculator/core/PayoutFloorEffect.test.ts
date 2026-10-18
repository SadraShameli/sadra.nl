import { describe, expect, it } from 'vitest';

import {
    EodTrailingDrawdown,
    FirmId,
    PayoutFloorEffect,
} from '~/lib/prop-calculator/core';
import { dollars } from '~/lib/prop-calculator/core/lib/units';
import { ALL_FIRMS, findFirm } from '~/lib/prop-calculator/firms';

describe('PayoutFloorEffect is a single discriminant, not two booleans', () => {
    it('rejects LockAtPlanFloor on a plan whose funded drawdown has no lock config', () => {
        const apex = findFirm(FirmId.Apex);
        if (!apex) throw new Error('Apex not registered');
        const base = apex.plans[0];
        if (!base) throw new Error('Apex has no plans');
        expect(base.fundedDrawdown.lock).toBeDefined();

        expect(() =>
            base.withOverrides({
                fundedDrawdown: new EodTrailingDrawdown({
                    amount: dollars(2000),
                }),
                payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
            }),
        ).toThrow(/LockAtPlanFloor/);
    });

    it('accepts LockAtPlanFloor when the funded drawdown has a lock config', () => {
        const firm = findFirm(FirmId.Tradeify);
        if (!firm) throw new Error('Tradeify not registered');
        const growth = firm.plans.find((p) => p.label.includes('Growth'));
        if (!growth) throw new Error('Tradeify Growth plan not found');

        expect(growth.payoutFloorEffect).toBe(
            PayoutFloorEffect.LockAtPlanFloor,
        );
        expect(growth.fundedDrawdown.lock).toBeDefined();
    });

    it('every shipped plan sets exactly one payout floor effect', () => {
        for (const firm of ALL_FIRMS) {
            for (const plan of firm.plans) {
                expect(Object.values(PayoutFloorEffect)).toContain(
                    plan.payoutFloorEffect,
                );
            }
        }
    });

    it('TopStep releases the floor to its funded starting balance, except Pro Account, whose own post-first-payout floor rule pro-account.md explicitly declines to confirm', () => {
        const firm = findFirm(FirmId.TopStep);
        if (!firm) throw new Error('TopStep not registered');
        for (const plan of firm.plans) {
            if (plan.label.includes('Pro Account')) {
                expect(plan.payoutFloorEffect).toBe(PayoutFloorEffect.None);
                continue;
            }
            expect(plan.payoutFloorEffect).toBe(PayoutFloorEffect.ReleaseFloor);
        }
    });

    it('keeps the exact LockAtPlanFloor no-lock message', () => {
        const base = apexPlan();
        expect(() =>
            base.withOverrides({
                fundedDrawdown: new EodTrailingDrawdown({
                    amount: dollars(2000),
                }),
                payoutFloorEffect: PayoutFloorEffect.LockAtPlanFloor,
            }),
        ).toThrow(
            `${base.label}: payoutFloorEffect is LockAtPlanFloor but fundedDrawdown has no lock config`,
        );
    });

    it('rejects MoveToLockedFloor on a funded drawdown with no lock config', () => {
        expect(() =>
            apexPlan().withOverrides({
                fundedDrawdown: new EodTrailingDrawdown({
                    amount: dollars(2000),
                }),
                payoutFloorEffect: PayoutFloorEffect.MoveToLockedFloor,
            }),
        ).toThrow(
            /payoutFloorEffect is MoveToLockedFloor but fundedDrawdown has no lock config/,
        );
    });

    it.each([PayoutFloorEffect.None, PayoutFloorEffect.LockAtPlanFloor])(
        'rejects a funded lock with no profit trigger under %s, which could never fire it and would deadlock payouts',
        (effect) => {
            expect(() =>
                apexPlan().withOverrides({
                    fundedDrawdown: payoutOnlyLock(),
                    payoutFloorEffect: effect,
                }),
            ).toThrow(/no profit trigger/);
        },
    );

    it('accepts a funded lock with no profit trigger under MoveToLockedFloor', () => {
        const plan = apexPlan().withOverrides({
            fundedDrawdown: payoutOnlyLock(),
            payoutFloorEffect: PayoutFloorEffect.MoveToLockedFloor,
        });
        expect(plan.payoutFloorEffect).toBe(
            PayoutFloorEffect.MoveToLockedFloor,
        );
    });

    it('rejects a separate evaluation drawdown whose lock has no profit trigger, since no payout happens in evaluation to fire it', () => {
        expect(() =>
            apexPlan().withOverrides({
                drawdown: payoutOnlyLock(),
                fundedDrawdown: new EodTrailingDrawdown({
                    amount: dollars(2000),
                }),
                payoutFloorEffect: PayoutFloorEffect.None,
            }),
        ).toThrow(
            /evaluation drawdown lock has no profit trigger and can never fire/,
        );
    });

    it('accepts one shared drawdown with no profit trigger under MoveToLockedFloor, since its funded use fires the lock', () => {
        const shared = payoutOnlyLock();
        const plan = apexPlan().withOverrides({
            drawdown: shared,
            fundedDrawdown: shared,
            payoutFloorEffect: PayoutFloorEffect.MoveToLockedFloor,
        });
        expect(plan.drawdown).toBe(plan.fundedDrawdown);
    });
});

function apexPlan() {
    const apex = findFirm(FirmId.Apex);
    if (!apex) throw new Error('Apex not registered');
    const base = apex.plans[0];
    if (!base) throw new Error('Apex has no plans');
    return base;
}

function payoutOnlyLock() {
    return new EodTrailingDrawdown({
        amount: dollars(2000),
        lock: {
            atProfit: null,
            lockedThreshold: (startingBalance) => startingBalance + 100,
        },
    });
}
