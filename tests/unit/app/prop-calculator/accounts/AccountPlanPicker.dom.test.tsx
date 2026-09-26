import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    AccountPlanIntent,
    type AccountPlanSelection,
} from '~/app/(app)/prop-calculator/accounts/_components/accountPlanOptions';
import * as accountPlanOptionsModule from '~/app/(app)/prop-calculator/accounts/_components/accountPlanOptions';
import { AccountPlanPicker } from '~/app/(app)/prop-calculator/accounts/_components/AccountPlanPicker';
import {
    ALL_FIRMS,
    findFirm,
    type Plan,
    PlanAvailability,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';

interface FirmPlan {
    readonly firm: TradingFirm;
    readonly plan: Plan;
}

function findFirmPlan(isMatch: (plan: Plan) => boolean): FirmPlan {
    for (const firm of ALL_FIRMS) {
        const plan = firm.plans.find((candidate) => isMatch(candidate));
        if (plan !== undefined) return { firm, plan };
    }
    throw new Error('no plan matches the predicate');
}

const DISCONTINUED = findFirmPlan(
    (plan) => plan.availability === PlanAvailability.Discontinued,
);
const PURCHASABLE_SIBLING = (() => {
    const plan = DISCONTINUED.firm.plans.find(
        (candidate) => candidate.availability === PlanAvailability.Purchasable,
    );
    if (plan === undefined) {
        throw new Error('the discontinued plan firm has no purchasable plan');
    }
    return plan;
})();

function chooseSelectValue(scope: ParentNode, value: string) {
    const select = [...scope.querySelectorAll('select')].find((candidate) =>
        [...candidate.options].some((option) => option.value === value),
    );
    if (select === undefined) throw new Error(`no select offering ${value}`);
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLSelectElement.prototype,
            'value',
        )?.set?.call(select, value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

function optionValues(container: HTMLElement): string[] {
    return [...container.querySelectorAll('option')].map(
        (option) => option.value,
    );
}

function selectionOf(plan: Plan, firm: TradingFirm): AccountPlanSelection {
    return {
        accountSize: plan.id.accountSize,
        firmId: firm.id,
        optIns: {
            takesFundedReset: false,
            takesOneTimeEarlyWithdrawal: false,
        },
        planSerial: serializePlanId(plan.id),
    };
}

describe('AccountPlanPicker', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    function render(
        intent: AccountPlanIntent | undefined,
        value: AccountPlanSelection,
    ) {
        act(() => {
            root.render(
                <form>
                    <AccountPlanPicker
                        errors={[]}
                        intent={intent}
                        onChange={vi.fn()}
                        value={value}
                    />
                </form>,
            );
        });
    }

    it('leaves a discontinued plan out of the plan select for a new purchase (PT-71e)', () => {
        render(
            AccountPlanIntent.NewPurchase,
            selectionOf(PURCHASABLE_SIBLING, DISCONTINUED.firm),
        );
        expect(optionValues(container)).not.toContain(
            serializePlanId(DISCONTINUED.plan.id),
        );
    });

    it('still offers and tags a discontinued plan when recording an existing account, the default', () => {
        render(
            AccountPlanIntent.ExistingAccount,
            selectionOf(DISCONTINUED.plan, DISCONTINUED.firm),
        );
        expect(optionValues(container)).toContain(
            serializePlanId(DISCONTINUED.plan.id),
        );
        expect(container.textContent).toContain('no longer sold');
    });

    it('offers a discontinued plan with no explicit intent, keeping the existing default', () => {
        render(undefined, selectionOf(DISCONTINUED.plan, DISCONTINUED.firm));
        expect(optionValues(container)).toContain(
            serializePlanId(DISCONTINUED.plan.id),
        );
    });

    it('keeps an existing account editable on its own discontinued plan', () => {
        const firm = findFirm(DISCONTINUED.firm.id);
        if (firm === undefined) throw new Error('firm not found');
        render(
            AccountPlanIntent.ExistingAccount,
            selectionOf(DISCONTINUED.plan, firm),
        );
        expect(container.textContent.includes(DISCONTINUED.plan.label)).toBe(
            true,
        );
    });

    it('never defaults to a discontinued plan after switching firms for a new purchase (PT-71e)', () => {
        const otherFirm = ALL_FIRMS.find(
            (firm) => firm.id !== DISCONTINUED.firm.id,
        );
        const [otherPlan] = otherFirm?.plans ?? [];
        if (otherFirm === undefined || otherPlan === undefined) {
            throw new Error('no other firm to start from');
        }
        const onChange = vi.fn<(next: AccountPlanSelection) => void>();
        act(() => {
            root.render(
                <form>
                    <AccountPlanPicker
                        errors={[]}
                        intent={AccountPlanIntent.NewPurchase}
                        onChange={onChange}
                        value={selectionOf(otherPlan, otherFirm)}
                    />
                </form>,
            );
        });
        chooseSelectValue(container, DISCONTINUED.firm.id);
        expect(onChange).toHaveBeenCalled();
        const [selection] = onChange.mock.calls.at(-1) ?? [];
        expect(selection?.planSerial).not.toBe(
            serializePlanId(DISCONTINUED.plan.id),
        );
        const selectedPlan = DISCONTINUED.firm.findPlanBySerial(
            selection?.planSerial ?? '',
        );
        expect(selectedPlan?.availability).not.toBe(
            PlanAvailability.Discontinued,
        );
    });

    it('picks the firm-switch default from accountPlanOptions of the current intent, not the firm’s raw unfiltered plan list (PT-71e)', () => {
        const spy = vi.spyOn(accountPlanOptionsModule, 'accountPlanOptions');
        const otherFirm = ALL_FIRMS.find(
            (firm) => firm.id !== DISCONTINUED.firm.id,
        );
        const [otherPlan] = otherFirm?.plans ?? [];
        if (otherFirm === undefined || otherPlan === undefined) {
            throw new Error('no other firm to start from');
        }
        act(() => {
            root.render(
                <form>
                    <AccountPlanPicker
                        errors={[]}
                        intent={AccountPlanIntent.NewPurchase}
                        onChange={vi.fn()}
                        value={selectionOf(otherPlan, otherFirm)}
                    />
                </form>,
            );
        });
        spy.mockClear();
        chooseSelectValue(container, DISCONTINUED.firm.id);
        expect(spy).toHaveBeenCalledWith(
            DISCONTINUED.firm,
            AccountPlanIntent.NewPurchase,
        );
    });
});
