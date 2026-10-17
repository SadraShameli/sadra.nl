import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Progress } from '~/components/ui/progress';

describe('Progress', () => {
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

    it('tells assistive technology its value instead of reading as indeterminate', () => {
        act(() => {
            root.render(<Progress aria-label="Upload" value={40} />);
        });
        const bar = container.querySelector<HTMLElement>(
            '[role="progressbar"]',
        );
        expect(bar?.getAttribute('aria-valuenow')).toBe('40');
        expect(bar?.dataset.state).toBe('loading');
    });
});
