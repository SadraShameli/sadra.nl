import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SampleBadge } from '~/app/(app)/prop-calculator/accounts/_components/overview/SampleBadge';
import { SampleLevel } from '~/lib/prop-accounts/core';

describe('SampleBadge', () => {
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
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('renders nothing when the threshold is not set (level null)', () => {
        act(() => {
            root.render(<SampleBadge level={null} />);
        });
        expect(container.textContent).toBe('');
    });

    it('labels a low sample', () => {
        act(() => {
            root.render(<SampleBadge level={SampleLevel.Low} />);
        });
        expect(container.textContent).toBe('Low sample');
    });

    it('labels an adequate sample', () => {
        act(() => {
            root.render(<SampleBadge level={SampleLevel.Adequate} />);
        });
        expect(container.textContent).toBe('Adequate sample');
    });

    it('labels no sample at n = 0', () => {
        act(() => {
            root.render(<SampleBadge level={SampleLevel.None} />);
        });
        expect(container.textContent).toBe('No sample');
    });
});
