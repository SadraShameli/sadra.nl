import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PortfolioPanel from '~/app/(app)/prop-calculator/_components/PortfolioPanel';
import { type PortfolioEntry } from '~/app/(app)/prop-calculator/_components/types';
import { formatCurrency } from '~/lib/format';
import {
    ALL_FIRMS,
    FirmId,
    LifetimeCapScope,
    type Plan,
    type PlanOptIns,
    simulate,
    TradingFirm,
} from '~/lib/prop-calculator';
import { findFirm } from '~/lib/prop-calculator/firms';

import {
    mffProLifetimeCapFixture,
    WINNING_TRADER_BASE,
} from '../../lib/prop-calculator/fixtures/mffProLifetimeCapFixture';

const NO_OPT_INS: PlanOptIns = {
    takesFundedReset: false,
    takesOneTimeEarlyWithdrawal: false,
};

class SingletonPlanFirm extends TradingFirm {
    readonly displayName = 'SingletonPlanFirm';
    readonly id = FirmId.Mffu;
    readonly plans: Plan[];
    readonly website = 'https://example.invalid';

    constructor(plan: Plan) {
        super();
        this.plans = [plan];
    }
}

function mffuFirm(): TradingFirm {
    const firm = findFirm(FirmId.Mffu);
    if (!firm) throw new Error('MFF firm not found');
    return firm;
}

const { cap: CAP, plan: mffPro } = mffProLifetimeCapFixture();

function copiesEntry(plan: Plan): PortfolioEntry {
    return {
        activationDiscountPercent: 0,
        count: 3,
        evalDiscountPercent: 0,
        firmId: plan.id.firm,
        id: 'copied-account',
        instrument: null,
        linkActivationDiscount: false,
        monthlySubscriptionDiscountPercent: 0,
        planId: plan.id,
        resetDiscountPercent: 0,
        stopPoints: null,
    };
}

describe('the Planner never shows a combined net above what the pooled per-user cap allows on 3 copied MFF Pro accounts (F-110, PT-12m)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(node: ReactNode) {
        act(() => {
            root.render(node);
        });
        for (let round = 0; round < 4; round++) {
            act(() => {
                vi.runOnlyPendingTimers();
            });
        }
    }

    function combinedNetCellText(): string | undefined {
        const label = [...container.querySelectorAll('p')].find(
            (node) => node.textContent === 'Combined monthly net',
        );
        const card = label?.closest('.px-3');
        return card?.querySelector('.font-mono')?.textContent ?? undefined;
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('renders the pooled-cap combined net from simulate() for 3 pooled-scope copies, not the naive per-copy multiple', () => {
        const expected = simulate({
            ...WINNING_TRADER_BASE,
            copyAccounts: 3,
            plan: mffPro,
        });
        expect(expected.expectedGrossPayout).toBeLessThanOrEqual(CAP);
        render(
            <PortfolioPanel
                baseInputs={WINNING_TRADER_BASE}
                currentFirm={mffuFirm()}
                currentPlan={mffPro}
                firms={ALL_FIRMS}
                onPortfolioChange={vi.fn()}
                planOptIns={NO_OPT_INS}
                portfolio={[copiesEntry(mffPro)]}
            />,
        );
        expect(combinedNetCellText()).toBe(
            formatCurrency(expected.expectedMonthlyNet),
        );
    });

    it('leaves a per-account-scope plan unaffected: it is not silently capped by the Planner too', () => {
        const perAccountPlan = mffPro.withOverrides({
            lifetimeDollarCapScope: LifetimeCapScope.PerAccount,
        });
        const expected = simulate({
            ...WINNING_TRADER_BASE,
            copyAccounts: 3,
            plan: perAccountPlan,
        });
        expect(expected.expectedGrossPayout).toBeGreaterThan(CAP);
        const firm = new SingletonPlanFirm(perAccountPlan);
        render(
            <PortfolioPanel
                baseInputs={WINNING_TRADER_BASE}
                currentFirm={firm}
                currentPlan={perAccountPlan}
                firms={[firm]}
                onPortfolioChange={vi.fn()}
                planOptIns={NO_OPT_INS}
                portfolio={[copiesEntry(perAccountPlan)]}
            />,
        );
        expect(combinedNetCellText()).toBe(
            formatCurrency(expected.expectedMonthlyNet),
        );
    });
});
