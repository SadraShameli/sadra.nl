import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlanEditor } from '~/app/(app)/profile/_components/PlanEditor';
import { NavigationBlockerProvider } from '~/components/NavigationBlocker';
import { DEFAULT_PLAN, KNOCKOUT_RULES } from '~/lib/trading/defaults';
import { type TradingPlanRow } from '~/lib/trading/types';

vi.mock('~/lib/trading/actions', () => ({ updateTradingPlan: vi.fn() }));

type Knockouts = TradingPlanRow['config']['knockouts'];

function alphabeticalOrder(a: string, b: string): number {
    return a.localeCompare(b);
}

function jsonbOrder(a: string, b: string): number {
    return a.length - b.length || a.localeCompare(b);
}

function keyOrdered(
    knockouts: Knockouts,
    compare: (a: string, b: string) => number,
): Knockouts {
    return Object.fromEntries(
        Object.entries(knockouts).toSorted(([a], [b]) => compare(a, b)),
    ) as Knockouts;
}

function planRow(knockouts: Knockouts): TradingPlanRow {
    return {
        config: { ...DEFAULT_PLAN, knockouts },
        createdAt: new Date('2026-10-15T00:00:00Z'),
        id: '00000000-0000-4000-8000-000000000001',
        isActive: true,
        name: 'Plan',
        sortOrder: 0,
        updatedAt: new Date('2026-10-15T00:00:00Z'),
        userId: 'user',
    };
}

describe('PlanEditor knockout rules', () => {
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
        container.remove();
        vi.unstubAllGlobals();
    });

    function renderedLabels(knockouts: Knockouts): string[] {
        act(() => {
            root.render(
                <NavigationBlockerProvider>
                    <PlanEditor plan={planRow(knockouts)} />
                </NavigationBlockerProvider>,
            );
        });
        const section = container.querySelector('.app-profile__plan-knockouts');
        return [
            ...(section?.querySelectorAll(
                ':scope [data-slot="field-content"] > [data-slot="field-label"]',
            ) ?? []),
        ].map((title) => title.textContent);
    }

    it.each([
        ['the database returns', jsonbOrder],
        ['the form holds while saving', alphabeticalOrder],
    ])(
        'lists the rules in their defined order when the plan keys come in the order %s',
        (_order, compare) => {
            expect(
                renderedLabels(keyOrdered(DEFAULT_PLAN.knockouts, compare)),
            ).toEqual(KNOCKOUT_RULES.map((rule) => rule.label));
        },
    );
});
