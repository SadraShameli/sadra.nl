import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TradingPlanRow } from '~/lib/trading/types';

import { WizardStepper } from '~/app/(app)/trade-checklist/_components/WizardStepper';
import { DEFAULT_PLAN, DEFAULT_PLAN_NAME } from '~/lib/trading/defaults';

vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: { children: ReactNode }) => children,
    motion: {
        div: ({
            children,
            className,
        }: {
            children?: ReactNode;
            className?: string;
        }) => <div className={className}>{children}</div>,
    },
}));

const PLAN: TradingPlanRow = {
    config: DEFAULT_PLAN,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    id: 'plan',
    isActive: true,
    name: DEFAULT_PLAN_NAME,
    sortOrder: 0,
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    userId: 'user',
};

const mounted: { container: HTMLDivElement; root: Root }[] = [];

function renderWizard(): HTMLDivElement {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    mounted.push({ container, root });
    act(() => {
        root.render(<WizardStepper onSubmit={vi.fn()} plan={PLAN} />);
    });
    return container;
}

function switchesIn(container: HTMLElement): HTMLButtonElement[] {
    return [
        ...container.querySelectorAll<HTMLButtonElement>('[role="switch"]'),
    ];
}

describe('the wizard mental-state step', () => {
    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    });

    afterEach(() => {
        for (const { container, root } of mounted.splice(0)) {
            act(() => root.unmount());
            container.remove();
        }
        vi.unstubAllGlobals();
    });

    it('flags a knockout when its switch is clicked', () => {
        const container = renderWizard();
        act(() => switchesIn(container)[0]?.click());
        expect(switchesIn(container)[0]?.getAttribute('aria-checked')).toBe(
            'true',
        );
    });

    it('flags a knockout when its row text is clicked', () => {
        const container = renderWizard();
        const label = switchesIn(container)[0]
            ?.closest('[data-slot="field"]')
            ?.querySelector('label');
        act(() => label?.click());
        expect(switchesIn(container)[0]?.getAttribute('aria-checked')).toBe(
            'true',
        );
    });
});
