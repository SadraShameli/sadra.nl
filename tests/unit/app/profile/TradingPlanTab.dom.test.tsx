import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TradingPlanRow } from '~/lib/trading/types';

import { DEFAULT_PLAN } from '~/lib/trading/defaults';

import {
    chooseRowAction,
    clickRowAction,
    confirmRowAction,
    isRowActionDisabled,
    openRowActions,
    rowActionLabels,
} from '../../components/rowActionsMenu';

const UPDATED = new Date('2026-10-01T09:00:00Z');

const harness = vi.hoisted(() => ({
    activated: [] as unknown[],
    cloned: [] as unknown[],
    deleted: [] as unknown[],
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('next/navigation', () => ({
    usePathname: () => '/profile',
    useRouter: () => ({ replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock('~/app/(app)/profile/_components/PlanEditor', () => ({
    PlanEditor: () => null,
}));
vi.mock(
    '~/app/(app)/trade-checklist/_components/DefaultTradingPlanSetup',
    () => ({ DefaultTradingPlanSetup: () => null }),
);
vi.mock('~/lib/trading/actions', () => ({
    cloneTradingPlan: (input: unknown) => {
        harness.cloned.push(input);
        return Promise.resolve();
    },
    createTradingPlan: () => Promise.resolve(),
    deleteTradingPlan: (input: unknown) => {
        harness.deleted.push(input);
        return Promise.resolve();
    },
    reorderTradingPlans: () => Promise.resolve(),
    setActiveTradingPlan: (input: unknown) => {
        harness.activated.push(input);
        return Promise.resolve();
    },
}));

const { TradingPlanTab } =
    await import('~/app/(app)/profile/_components/TradingPlanTab');
const { NavigationBlockerProvider } =
    await import('~/components/NavigationBlocker');

function plan(id: string, name: string, isActive: boolean): TradingPlanRow {
    return {
        config: DEFAULT_PLAN,
        createdAt: UPDATED,
        id,
        isActive,
        name,
        sortOrder: 0,
        updatedAt: UPDATED,
        userId: 'trader',
    };
}

function settle(): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
}

describe('TradingPlanTab row menu', () => {
    let container: HTMLDivElement;
    let root: Root;

    function renderPlans(plans: TradingPlanRow[]) {
        act(() => {
            root.render(
                <NavigationBlockerProvider>
                    <TradingPlanTab plans={plans} />
                </NavigationBlockerProvider>,
            );
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.activated.length = 0;
        harness.cloned.length = 0;
        harness.deleted.length = 0;
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

    it('offers activate only on inactive plans and marks the plan being edited', async () => {
        renderPlans([
            plan('plan-a', 'Funded', true),
            plan('plan-b', 'Eval', false),
        ]);
        const fundedRow = container.querySelector('[data-state="active"]');
        expect(fundedRow?.textContent).toContain('Editing');

        openRowActions('Funded');
        expect(rowActionLabels()).toEqual(['Edit', 'Duplicate', 'Delete']);
        clickRowAction('Duplicate');
        await act(settle);
        expect(harness.cloned).toEqual([{ planId: 'plan-a' }]);

        openRowActions('Eval');
        expect(rowActionLabels()).toEqual([
            'Edit',
            'Activate',
            'Duplicate',
            'Delete',
        ]);
        clickRowAction('Activate');
        await act(settle);
        expect(harness.activated).toEqual([{ planId: 'plan-b' }]);
    });

    it('moves the editing mark to the plan picked from the menu', () => {
        renderPlans([
            plan('plan-a', 'Funded', true),
            plan('plan-b', 'Eval', false),
        ]);
        chooseRowAction('Eval', 'Edit');
        const rows = [
            ...container.querySelectorAll<HTMLElement>(
                '.app-profile__plan-row',
            ),
        ];
        expect(rows.map((row) => row.textContent.includes('Editing'))).toEqual([
            false,
            true,
        ]);
    });

    it('deletes a plan only after confirming and never the last one', async () => {
        renderPlans([
            plan('plan-a', 'Funded', true),
            plan('plan-b', 'Eval', false),
        ]);
        chooseRowAction('Eval', 'Delete');
        expect(harness.deleted).toEqual([]);
        confirmRowAction('Delete');
        await act(settle);
        expect(harness.deleted).toEqual([{ planId: 'plan-b' }]);

        renderPlans([plan('plan-a', 'Funded', true)]);
        openRowActions('Funded');
        expect(isRowActionDisabled('Delete')).toBe(true);
    });
});
