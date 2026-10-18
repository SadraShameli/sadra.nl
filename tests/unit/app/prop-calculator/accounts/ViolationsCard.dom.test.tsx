import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type ViolationsCardModel } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { ViolationsCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/ViolationsCard';
import { RuleViolationKind } from '~/lib/prop-accounts';

import { infoText } from '../infoPopover';
import { statStripValue } from '../statStripValue';

describe('ViolationsCard', () => {
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
    });

    function render(model: ViolationsCardModel) {
        act(() => {
            root.render(<ViolationsCard model={model} />);
        });
    }

    it('says no violations are recorded yet when the model is empty', () => {
        render({
            byKind: [],
            detectedCount: 0,
            disclosures: [],
            manualCount: 0,
            netCost: '$0',
            netCostShareOfNetCash: null,
        });
        expect(container.textContent).toContain(
            'No rule violations recorded yet',
        );
    });

    it('shows the net cost, its share of net cash, the manual/detected split and each kind', () => {
        render({
            byKind: [
                {
                    cost: '$100',
                    count: 2,
                    key: RuleViolationKind.Oversize,
                    kind: RuleViolationKind.Oversize,
                },
            ],
            detectedCount: 1,
            disclosures: ['A disclosure line'],
            manualCount: 2,
            netCost: '$150',
            netCostShareOfNetCash: '10.0%',
        });
        expect(statStripValue(container, 'Total cost')?.textContent).toBe(
            '$150',
        );
        expect(
            statStripValue(container, 'Share of net cash')?.textContent,
        ).toBe('10.0%');
        expect(statStripValue(container, 'Logged by you')?.textContent).toBe(
            '2',
        );
        expect(
            statStripValue(container, 'Detected from your journal')
                ?.textContent,
        ).toBe('1');
        expect(container.textContent).toContain(
            'Position above the documented size',
        );
        expect(container.textContent).toContain('$100');
        expect(infoText(container, 'Rule violations')).toContain(
            'A disclosure line',
        );
    });

    it('groups the logged and detected counts in thousands', () => {
        render({
            byKind: [
                {
                    cost: '$100',
                    count: 2,
                    key: RuleViolationKind.Oversize,
                    kind: RuleViolationKind.Oversize,
                },
            ],
            detectedCount: 1250,
            disclosures: [],
            manualCount: 3400,
            netCost: '$150',
            netCostShareOfNetCash: null,
        });
        expect(statStripValue(container, 'Logged by you')?.textContent).toBe(
            '3,400',
        );
        expect(
            statStripValue(container, 'Detected from your journal')
                ?.textContent,
        ).toBe('1,250');
        expect(statStripValue(container, 'Share of net cash')).toBeUndefined();
    });

    it('shows no share of net cash when it is null', () => {
        render({
            byKind: [],
            detectedCount: 0,
            disclosures: [],
            manualCount: 0,
            netCost: '$0',
            netCostShareOfNetCash: null,
        });
        expect(container.textContent).not.toMatch(/%/);
    });
});
