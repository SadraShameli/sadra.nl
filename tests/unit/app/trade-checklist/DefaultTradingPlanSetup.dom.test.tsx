import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DefaultTradingPlanSetup } from '~/app/(app)/trade-checklist/_components/DefaultTradingPlanSetup';

const actions = vi.hoisted(() => ({
    createDefaultTradingPlan: vi.fn(() => Promise.resolve()),
}));

vi.mock('~/lib/trading/actions', () => actions);

interface Mounted {
    readonly container: HTMLDivElement;
    readonly root: Root;
}

const mounted: Mounted[] = [];

function mount(): Mounted {
    const container = document.createElement('div');
    document.body.append(container);
    const entry = { container, root: createRoot(container) };
    mounted.push(entry);
    return entry;
}

describe('DefaultTradingPlanSetup', () => {
    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        actions.createDefaultTradingPlan.mockClear();
    });

    afterEach(() => {
        for (const { container, root } of mounted.splice(0)) {
            act(() => root.unmount());
            container.remove();
        }
        vi.unstubAllGlobals();
    });

    it('asks the server for the default plan once, even under strict mode', async () => {
        const { root } = mount();
        await act(async () => {
            root.render(
                <StrictMode>
                    <DefaultTradingPlanSetup />
                </StrictMode>,
            );
            await Promise.resolve();
        });
        expect(actions.createDefaultTradingPlan).toHaveBeenCalledOnce();
    });

    it('tells the user the plan is being set up while it waits', () => {
        const { container, root } = mount();
        act(() => {
            root.render(<DefaultTradingPlanSetup />);
        });
        expect(container.querySelector('[role="status"]')?.textContent).toBe(
            'Setting up your default trading plan.',
        );
    });
});
