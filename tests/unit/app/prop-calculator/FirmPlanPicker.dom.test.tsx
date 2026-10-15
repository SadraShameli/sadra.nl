import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FirmPlanPicker from '~/app/(app)/prop-calculator/_components/FirmPlanPicker';
import { formatCompactCurrency } from '~/lib/format';
import { ALL_FIRMS } from '~/lib/prop-calculator';

describe('FirmPlanPicker plan trigger (PT-119)', () => {
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

    it('shows only the plan label in the trigger and the target and drawdown in a hint it points to', () => {
        const firm = ALL_FIRMS[0];
        const plan = firm?.plans[0];
        if (firm === undefined || plan === undefined) {
            throw new Error('expected a registry plan');
        }
        act(() => {
            root.render(
                <FirmPlanPicker
                    firm={firm}
                    firms={ALL_FIRMS}
                    onFirmChange={vi.fn()}
                    onPlanChange={vi.fn()}
                    plan={plan}
                />,
            );
        });
        const trigger = container.querySelector('#plan-select');
        const hintId = trigger?.getAttribute('aria-describedby') ?? '';
        expect(trigger?.textContent).toBe(plan.label);
        expect(container.querySelector(`#${hintId}`)?.textContent).toBe(
            `Target ${formatCompactCurrency(plan.profitTarget)} · drawdown ${formatCompactCurrency(plan.drawdown.amount)}`,
        );
    });
});
