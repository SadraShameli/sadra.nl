import { describe, expect, it, vi } from 'vitest';

import type * as PropCalculatorModule from '~/lib/prop-calculator';

const box = vi.hoisted(() => ({ discontinuedSerial: '' }));

vi.mock('~/lib/prop-calculator', async (importOriginal) => {
    const actual = await importOriginal<typeof PropCalculatorModule>();
    const fundedNext = actual.findFirm(actual.FirmId.FundedNext);
    if (fundedNext === undefined) {
        throw new Error('FundedNext is missing from ALL_FIRMS');
    }
    const discontinued = fundedNext.plans.find(
        (plan) => plan.availability === actual.PlanAvailability.Discontinued,
    );
    if (discontinued === undefined) {
        throw new Error(
            'FundedNext has no discontinued plan to move to the front of its size',
        );
    }
    box.discontinuedSerial = actual.serializePlanId(discontinued.id);
    const discontinuedFirst = Object.assign(
        Object.create(Object.getPrototypeOf(fundedNext) as object),
        fundedNext,
        {
            plans: [
                discontinued,
                ...fundedNext.plans.filter((plan) => plan !== discontinued),
            ],
        },
    ) as PropCalculatorModule.TradingFirm;
    return {
        ...actual,
        findFirm: (id: unknown) =>
            id === actual.FirmId.FundedNext
                ? discontinuedFirst
                : actual.findFirm(id as never),
    };
});

const { AccountPlanIntent, upgradePlanSelection } = await import(
    '~/app/(app)/prop-calculator/accounts/_components/accountPlanOptions'
);
const { FirmId } = await import('~/lib/prop-calculator');

describe('upgradePlanSelection honours the intent when the size-matched plan is discontinued (PT-71h)', () => {
    it('still starts an existing account on a discontinued plan that is first at its size', () => {
        const selection = upgradePlanSelection(
            FirmId.FundedNext,
            50_000,
            AccountPlanIntent.ExistingAccount,
        );
        expect(selection.planSerial).toBe(box.discontinuedSerial);
    });

    it('skips a discontinued plan for a new purchase even when it is first at its size', () => {
        const selection = upgradePlanSelection(
            FirmId.FundedNext,
            50_000,
            AccountPlanIntent.NewPurchase,
        );
        expect(selection.planSerial).not.toBe(box.discontinuedSerial);
        expect(selection.accountSize).toBe(50_000);
    });
});
