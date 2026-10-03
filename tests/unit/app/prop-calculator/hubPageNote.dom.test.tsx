import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PropertyCalculatorPage from '~/app/(app)/prop-calculator/page';

vi.mock(
    '~/app/(app)/prop-calculator/_components/hub/HubAccountsTeaser',
    () => ({
        HubAccountsTeaser: () => null,
    }),
);

vi.mock('~/app/(app)/prop-calculator/_components/hub/HubRecentTools', () => ({
    HubRecentTools: () => null,
}));

vi.mock(
    '~/app/(app)/prop-calculator/_components/HubLegacySectionRedirect',
    () => ({ HubLegacySectionRedirect: () => null }),
);

vi.mock('~/app/(app)/prop-calculator/_components/HubToolCards', () => ({
    HubToolCards: () => null,
}));

describe('the hub page note', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(<PropertyCalculatorPage />);
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
    });

    it('tells the user that pinned scenarios and lab results reset when they leave the tools', () => {
        expect(
            container.querySelector(':scope header p')?.textContent,
        ).toContain(
            'Your inputs carry over between tools; pinned scenarios and lab results reset when you leave the tools and come back here.',
        );
    });

    it('has one main landmark and one h1', () => {
        expect(container.querySelectorAll(':scope main')).toHaveLength(1);
        expect(container.querySelectorAll(':scope h1')).toHaveLength(1);
    });
});
