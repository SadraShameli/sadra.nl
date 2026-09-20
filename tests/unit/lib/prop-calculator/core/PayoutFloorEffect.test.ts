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
});
