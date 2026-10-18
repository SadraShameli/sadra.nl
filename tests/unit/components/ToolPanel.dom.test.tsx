import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToolPanel } from '~/components/ToolPanel';

describe('the tool panel heading', () => {
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

    it('renders an h2 by default', () => {
        act(() => {
            root.render(<ToolPanel title="Cushion">body</ToolPanel>);
        });
        expect(container.querySelector(':scope h2')?.textContent).toBe(
            'Cushion',
        );
    });

    it('takes a lower heading level and an id for a section to point at', () => {
        act(() => {
            root.render(
                <ToolPanel
                    title="Win rate"
                    titleAs="h3"
                    titleId="edge-win-rate"
                >
                    body
                </ToolPanel>,
            );
        });
        const heading = container.querySelector(':scope h3');
        expect(heading?.textContent).toBe('Win rate');
        expect(heading?.id).toBe('edge-win-rate');
        expect(container.querySelector(':scope h2')).toBeNull();
    });
});
