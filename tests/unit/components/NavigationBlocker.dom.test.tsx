import { act, type ReactNode, type Ref } from 'react';
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
        ref,
    }: {
        children: ReactNode;
        onNavigate?: (event: NavigateEvent) => void;
        ref?: Ref<HTMLButtonElement>;
    }) => (
        <button
            data-testid="leave-link"
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
            ref={ref}
            type="button"
        >
            {children}
        </button>
    ),
}));

const mounted: Mounted[] = [];

function answerDialog(label: string): void {
    const button = [...(leaveDialog()?.querySelectorAll('button') ?? [])].find(
        (candidate) => candidate.textContent === label,
    );
    act(() => {
        button?.click();
    });
}

function clickLeave(): NavigateEvent | undefined {
    act(() => {
        document
            .querySelector<HTMLButtonElement>('[data-testid="leave-link"]')
            ?.click();
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

function leaveDialog(): HTMLElement | null {
    return document.querySelector('[role="alertdialog"]');
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
        renderInProvider(mount(), <Editor isUnsaved={false} />);
        expect(clickLeave()?.defaultPrevented).toBe(false);
        expect(leaveDialog()).toBeNull();
        expect(isUnloadPrevented()).toBe(false);
    });

    it('cancels the navigation when the user declines to leave unsaved changes', () => {
        renderInProvider(mount(), <Editor isUnsaved />);
        expect(clickLeave()?.defaultPrevented).toBe(true);
        expect(leaveDialog()).not.toBeNull();
        answerDialog('Cancel');
        expect(navigation.events).toHaveLength(1);
    });

    it('navigates when the user confirms leaving unsaved changes', () => {
        renderInProvider(mount(), <Editor isUnsaved />);
        expect(clickLeave()?.defaultPrevented).toBe(true);
        answerDialog('Leave');
        expect(navigation.events).toHaveLength(2);
        expect(navigation.events.at(-1)?.defaultPrevented).toBe(false);
    });

    it('warns before unloading the page only while unsaved', () => {
        const root = mount();
        renderInProvider(root, <Editor isUnsaved />);
        expect(isUnloadPrevented()).toBe(true);
        renderInProvider(root, <Editor isUnsaved={false} />);
        expect(isUnloadPrevented()).toBe(false);
    });

    it('stops blocking once the editor unmounts', () => {
        const root = mount();
        renderInProvider(root, <Editor isUnsaved />);
        renderInProvider(
            root,
            <BlockableLink href={routes.tradeChecklist.index}>
                Leave
            </BlockableLink>,
        );
        expect(clickLeave()?.defaultPrevented).toBe(false);
        expect(leaveDialog()).toBeNull();
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
