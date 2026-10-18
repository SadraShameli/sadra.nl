import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    StatStrip,
    type StatStripItem,
    StatTone,
} from '~/components/StatStrip';

const ITEMS: StatStripItem[] = [
    { caption: 'per month', id: 'net', label: 'Expected net', value: '$1,240' },
    {
        id: 'pass',
        info: 'Share of evals passed.',
        label: 'Pass rate',
        value: '38%',
    },
];

describe('the stat strip', () => {
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

    function render(isLoading = false) {
        act(() => {
            root.render(<StatStrip isLoading={isLoading} items={ITEMS} />);
        });
    }

    it('pairs every label with its value and caption in a description list', () => {
        render();
        const terms = [...container.querySelectorAll(':scope dt')].map(
            (term) => term.textContent,
        );
        const details = [...container.querySelectorAll(':scope dd')].map(
            (detail) => detail.textContent,
        );
        expect(terms).toEqual(['Expected net', 'Pass rate']);
        expect(details).toEqual(['$1,240', 'per month', '38%']);
    });

    it('puts methodology behind an info button on the label', () => {
        render();
        expect(
            container.querySelector(
                ':scope button[aria-label="About Pass rate"]',
            ),
        ).not.toBeNull();
    });

    it('shows skeletons instead of values while loading', () => {
        render(true);
        expect(container.textContent).not.toContain('$1,240');
        expect(
            container.querySelectorAll(':scope [data-slot="skeleton"]'),
        ).toHaveLength(2);
    });

    it('shows a skeleton only for the figure that is still loading', () => {
        act(() => {
            root.render(
                <StatStrip
                    items={ITEMS.map((item, index) =>
                        index === 0 ? { ...item, isLoading: true } : item,
                    )}
                />,
            );
        });
        expect(container.textContent).not.toContain('$1,240');
        expect(container.textContent).not.toContain('per month');
        expect(container.textContent).toContain('38%');
        expect(
            container.querySelectorAll(':scope [data-slot="skeleton"]'),
        ).toHaveLength(1);
    });

    it('tones a figure and names the strip as a group', () => {
        act(() => {
            root.render(
                <StatStrip
                    items={[
                        {
                            id: 'loss',
                            label: 'Worst day',
                            tone: StatTone.Negative,
                            value: '-$480',
                        },
                    ]}
                    label="Risk figures"
                />,
            );
        });
        expect(container.querySelector(':scope dd')?.className).toContain(
            'text-destructive',
        );
        expect(
            container
                .querySelector(':scope [role="group"]')
                ?.getAttribute('aria-label'),
        ).toBe('Risk figures');
    });
});
