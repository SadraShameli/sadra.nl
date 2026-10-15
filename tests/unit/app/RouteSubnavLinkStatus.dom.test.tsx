import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RouteSubnavLinkStatus } from '~/app/(app)/_components/RouteSubnavLinkStatus';

const linkStatus = vi.hoisted(() => ({ isPending: false }));

vi.mock('next/link', () => ({
    useLinkStatus: () => ({ pending: linkStatus.isPending }),
}));

describe('RouteSubnavLinkStatus', () => {
    let container: HTMLDivElement;
    let root: Root;

    function indicator(isPending: boolean): HTMLSpanElement {
        linkStatus.isPending = isPending;
        act(() => {
            root.render(<RouteSubnavLinkStatus />);
        });
        const found = container.querySelector('span');
        if (found === null) throw new Error('no indicator');
        return found;
    }

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

    it('keeps a hidden, fixed-size hint in place while no navigation is pending', () => {
        const hint = indicator(false);
        expect(hint.dataset.pending).toBe('false');
        expect(hint.getAttribute('aria-hidden')).toBe('true');
        expect(hint.classList).toContain('opacity-0');
        expect(hint.classList).toContain('absolute');
    });

    it('shows the hint while the navigation is in flight', () => {
        const hint = indicator(true);
        expect(hint.dataset.pending).toBe('true');
        expect(hint.classList).toContain('opacity-100');
    });
});
