import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    BlockableLink,
    NavigationBlockerMissingError,
    NavigationBlockerProvider,
    useBlockNavigationWhile,
} from '~/components/NavigationBlocker';
import { routes } from '~/lib/site/routes';

interface Mounted {
    readonly container: HTMLDivElement;
    readonly root: Root;
}

interface NavigateEvent {
    defaultPrevented: boolean;
    preventDefault: () => void;
}

const navigation = vi.hoisted(() => {
    const events: NavigateEvent[] = [];
    return { events };
});

vi.mock('next/link', () => ({
    default: ({
        children,
        onNavigate,
    }: {
        children: ReactNode;
        onNavigate?: (event: NavigateEvent) => void;
    }) => (
        <button
            onClick={() => {
                const event: NavigateEvent = {
                    defaultPrevented: false,
                    preventDefault() {
                        event.defaultPrevented = true;
                    },
                };
                onNavigate?.(event);
                navigation.events.push(event);
            }}
            type="button"
        >
            {children}
        </button>
    ),
}));

const mounted: Mounted[] = [];

function clickLeave(): NavigateEvent | undefined {
    act(() => {
        document.querySelector('button')?.click();
    });
    return navigation.events.at(-1);
}

function Editor({ isUnsaved }: { readonly isUnsaved: boolean }) {
    useBlockNavigationWhile(isUnsaved);
    return (
        <BlockableLink href={routes.tradeChecklist.index}>Leave</BlockableLink>
    );
}

function isUnloadPrevented(): boolean {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
}

function mount(): Root {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    mounted.push({ container, root });
    return root;
}

function renderInProvider(root: Root, node: ReactNode): void {
    act(() => {
        root.render(
            <NavigationBlockerProvider>{node}</NavigationBlockerProvider>,
        );
    });
}

function stubConfirm(shouldLeave: boolean) {
    const isLeaveConfirmed = vi.fn(() => shouldLeave);
    vi.stubGlobal('confirm', isLeaveConfirmed);
    return isLeaveConfirmed;
}

describe('NavigationBlocker', () => {
    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        navigation.events.length = 0;
    });

    afterEach(() => {
        for (const { container, root } of mounted.splice(0)) {
            act(() => root.unmount());
            container.remove();
        }
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('lets a link navigate while the form is clean, without asking', () => {
        const isLeaveConfirmed = stubConfirm(true);
        renderInProvider(mount(), <Editor isUnsaved={false} />);
        expect(clickLeave()?.defaultPrevented).toBe(false);
        expect(isLeaveConfirmed).not.toHaveBeenCalled();
        expect(isUnloadPrevented()).toBe(false);
    });

    it('cancels the navigation when the user declines to leave unsaved changes', () => {
        const isLeaveConfirmed = stubConfirm(false);
        renderInProvider(mount(), <Editor isUnsaved />);
        expect(clickLeave()?.defaultPrevented).toBe(true);
        expect(isLeaveConfirmed).toHaveBeenCalledOnce();
    });

    it('navigates when the user confirms leaving unsaved changes', () => {
        stubConfirm(true);
        renderInProvider(mount(), <Editor isUnsaved />);
        expect(clickLeave()?.defaultPrevented).toBe(false);
    });

    it('warns before unloading the page only while unsaved', () => {
        const root = mount();
        renderInProvider(root, <Editor isUnsaved />);
        expect(isUnloadPrevented()).toBe(true);
        renderInProvider(root, <Editor isUnsaved={false} />);
        expect(isUnloadPrevented()).toBe(false);
    });

    it('stops blocking once the editor unmounts', () => {
        const isLeaveConfirmed = stubConfirm(true);
        const root = mount();
        renderInProvider(root, <Editor isUnsaved />);
        renderInProvider(
            root,
            <BlockableLink href={routes.tradeChecklist.index}>
                Leave
            </BlockableLink>,
        );
        expect(clickLeave()?.defaultPrevented).toBe(false);
        expect(isLeaveConfirmed).not.toHaveBeenCalled();
        expect(isUnloadPrevented()).toBe(false);
    });

    it('fails loud outside its provider', () => {
        vi.spyOn(console, 'error').mockImplementation(vi.fn());
        const root = mount();
        expect(() => {
            act(() => {
                root.render(<Editor isUnsaved={false} />);
            });
        }).toThrow(NavigationBlockerMissingError);
    });
});
