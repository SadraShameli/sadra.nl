import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HEADER_HEIGHT_VARIABLE } from '~/app/(app)/_components/headerHeight';
import { useHeaderHeightVariable } from '~/app/(app)/_components/useHeaderHeightVariable';

const HEADER_HEIGHT = 113;

class ImmediateResizeObserver {
    constructor(private readonly callback: () => void) {}

    disconnect(): void {
        return;
    }

    observe(): void {
        this.callback();
    }
}

function Header() {
    const reference = useRef<HTMLElement>(null);
    useHeaderHeightVariable(reference);
    return <nav ref={reference} />;
}

describe('useHeaderHeightVariable (PT-119)', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        vi.stubGlobal('ResizeObserver', ImmediateResizeObserver);
        vi.spyOn(
            HTMLElement.prototype,
            'getBoundingClientRect',
        ).mockReturnValue(new DOMRect(0, 0, 1440, HEADER_HEIGHT));
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        document.body.replaceChildren();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('publishes the real sticky header height as the scroll offset variable and clears it on unmount', () => {
        act(() => {
            root.render(<Header />);
        });
        expect(
            document.documentElement.style.getPropertyValue(
                HEADER_HEIGHT_VARIABLE,
            ),
        ).toBe(`${String(HEADER_HEIGHT)}px`);
        act(() => {
            root.unmount();
        });
        expect(
            document.documentElement.style.getPropertyValue(
                HEADER_HEIGHT_VARIABLE,
            ),
        ).toBe('');
    });
});
