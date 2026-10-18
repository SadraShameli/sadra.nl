import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PageHeader } from '~/components/PageHeader';
import { routes } from '~/lib/site/routes';

describe('the page header', () => {
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

    it('leads a detail page with a link back to its list', () => {
        act(() => {
            root.render(
                <PageHeader
                    backLink={{
                        href: routes.propCalculator.accounts.index,
                        label: 'All accounts',
                    }}
                    title="Lucid 50K #1"
                />,
            );
        });
        const back = container.querySelector(':scope a');
        expect(back?.textContent).toBe('All accounts');
        expect(back?.getAttribute('href')).toBe(
            routes.propCalculator.accounts.index,
        );
        expect(container.querySelector(':scope h1')?.textContent).toBe(
            'Lucid 50K #1',
        );
    });

    it('shows detail metadata under the title', () => {
        act(() => {
            root.render(
                <PageHeader
                    meta={<span>Barbell</span>}
                    title="Ab wheel rollout"
                />,
            );
        });
        expect(container.textContent).toContain('Barbell');
    });
});
