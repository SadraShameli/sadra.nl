import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    DetailList,
    type DetailListItem,
    DetailListLayout,
} from '~/components/DetailList';

const ITEMS: readonly DetailListItem[] = [
    { id: 'drawdown', label: 'Drawdown', value: '$2,000 EOD trailing' },
    {
        id: 'consistency',
        info: 'The best day may hold at most this share of the profit.',
        label: 'Consistency',
        value: '40%',
    },
];

describe('the detail list', () => {
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

    function list(): HTMLElement {
        const found = container.querySelector<HTMLElement>(':scope dl');
        if (found === null) throw new Error('no detail list');
        return found;
    }

    it('pairs every label with its value, and puts the explanation behind an info button', () => {
        act(() => {
            root.render(<DetailList items={ITEMS} label="Plan rules" />);
        });
        const terms = [...list().querySelectorAll(':scope dt')].map(
            (term) => term.textContent,
        );
        const details = [...list().querySelectorAll(':scope dd')].map(
            (detail) => detail.textContent,
        );
        expect(terms).toEqual(['Drawdown', 'Consistency']);
        expect(details).toEqual(['$2,000 EOD trailing', '40%']);
        expect(list().getAttribute('aria-label')).toBe('Plan rules');
        expect(
            list().querySelector(
                ':scope button[aria-label="About Consistency"]',
            ),
        ).not.toBeNull();
    });

    it('splits into label and value columns from tablet width, and stays stacked in a narrow container', () => {
        act(() => {
            root.render(<DetailList items={ITEMS} />);
        });
        expect(list().className).toContain('md:grid-cols-');
        act(() => {
            root.render(
                <DetailList items={ITEMS} layout={DetailListLayout.Stacked} />,
            );
        });
        expect(list().className).not.toContain('md:grid-cols-');
    });
});
