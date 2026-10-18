import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PanelErrorBoundary } from '~/components/PanelErrorBoundary';

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock('@sentry/nextjs', () => sentry);

const PANEL_FAILURE = 'The chart data was malformed.';

function doNothing(): void {
    return;
}

function FailingPanel(): never {
    throw new Error(PANEL_FAILURE);
}

describe('PanelErrorBoundary', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        vi.spyOn(console, 'error').mockImplementation(doNothing);
        sentry.captureException.mockClear();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('replaces only the failing panel with the section error and keeps its siblings', () => {
        act(() => {
            root.render(
                <>
                    <PanelErrorBoundary section="Charts">
                        <FailingPanel />
                    </PanelErrorBoundary>
                    <PanelErrorBoundary section="Totals">
                        <p>Total 1,234</p>
                    </PanelErrorBoundary>
                </>,
            );
        });

        expect(container.textContent).toContain('Charts could not load');
        expect(container.textContent).toContain('Total 1,234');
        expect(container.textContent).not.toContain('Totals could not load');
        expect(sentry.captureException).toHaveBeenCalledWith(
            expect.objectContaining({ message: PANEL_FAILURE }),
        );
    });
});
