import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PositionSizeView } from '~/app/(app)/prop-calculator/(tools)/position-size/PositionSizeView';
import { PositionSizeUrlParameter } from '~/app/(app)/prop-calculator/_components/positionSize/positionSizeUrlState';
import { NOT_APPLICABLE } from '~/lib/format';

const harness = vi.hoisted(() => ({ query: '' }));

vi.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams(harness.query),
}));

vi.mock('~/app/(app)/prop-calculator/_components/ToolPageHeading', () => ({
    ToolPageHeading: ({ ownQuery }: { ownQuery: string }) => (
        <div className="own-query-under-test" data-own-query={ownQuery} />
    ),
}));

const FIX_TEXT = 'Fix the highlighted field to see the position.';

function typeInto(input: HTMLInputElement, text: string) {
    act(() => {
        Reflect.set(HTMLInputElement.prototype, 'value', text, input);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

describe('PositionSizeView', () => {
    let container: HTMLDivElement;
    let root: Root;

    function field(id: string): HTMLInputElement {
        const element = container.querySelector(`#${id}`);
        if (!(element instanceof HTMLInputElement)) {
            throw new TypeError(`no input #${id}`);
        }
        return element;
    }

    function ownQuery(): URLSearchParams {
        const heading = container.querySelector('.own-query-under-test');
        return new URLSearchParams(
            heading instanceof HTMLElement
                ? (heading.dataset.ownQuery ?? '')
                : '',
        );
    }

    function positionSection(): HTMLElement {
        const section = container.querySelector(
            'section[aria-labelledby="position-size-result-heading"]',
        );
        if (!(section instanceof HTMLElement)) {
            throw new TypeError('no position section');
        }
        return section;
    }

    function status(): string {
        return container.querySelector('[role="status"]')?.textContent ?? '';
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.query = `${PositionSizeUrlParameter.Risk}=475&${PositionSizeUrlParameter.Stop}=7.5`;
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(<PositionSizeView />);
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('shows the position for the entered risk and stop', () => {
        const text = positionSection().textContent;
        expect(text).toContain('3 NQ');
        expect(text).toContain('$25');
        expect(text).not.toContain(FIX_TEXT);
        expect(ownQuery().get(PositionSizeUrlParameter.Risk)).toBe('475');
    });

    it('shows no contract count or leftover while the risk field is empty, and leaves the risk out of the share link', () => {
        typeInto(field('position-size-risk'), '');
        const text = positionSection().textContent;
        expect(text).toContain(FIX_TEXT);
        expect(text).not.toContain('3 NQ');
        expect(text).not.toContain('$25');
        expect(text).toContain(NOT_APPLICABLE);
        expect(ownQuery().has(PositionSizeUrlParameter.Risk)).toBe(false);
        expect(ownQuery().get(PositionSizeUrlParameter.Stop)).toBe('7.5');
        expect(status()).toBe(FIX_TEXT);
    });

    it('shows no stale position while the stop is below the tick, and recovers on a valid stop', () => {
        typeInto(field('position-size-stop'), '0.1');
        expect(positionSection().textContent).toContain(FIX_TEXT);
        expect(positionSection().textContent).not.toContain('3 NQ');
        expect(ownQuery().has(PositionSizeUrlParameter.Stop)).toBe(false);
        typeInto(field('position-size-stop'), '5');
        const text = positionSection().textContent;
        expect(text).not.toContain(FIX_TEXT);
        expect(ownQuery().get(PositionSizeUrlParameter.Stop)).toBe('5');
    });

    it('announces one summary sentence through a status region, not the whole section', () => {
        expect(positionSection().hasAttribute('aria-live')).toBe(false);
        expect(container.querySelectorAll('[aria-live]')).toHaveLength(0);
        expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
        expect(status()).toBe(
            '3 NQ, $25 left over; the stop for the exact risk is 7.75 points, risking $465.',
        );
    });
});
