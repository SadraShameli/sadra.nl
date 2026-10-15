'use client';

import Link from 'next/link';
import {
    type ComponentProps,
    createContext,
    type ReactNode,
    useContext,
    useEffect,
    useState,
} from 'react';

const UNSAVED_CHANGES_PROMPT = 'You have unsaved changes. Leave anyway?';

interface NavigationBlockerState {
    readonly isBlocked: boolean;
    readonly setIsBlocked: (isBlocked: boolean) => void;
}

export class NavigationBlockerMissingError extends Error {
    constructor() {
        super('Navigation blocker used outside a NavigationBlockerProvider');
        this.name = 'NavigationBlockerMissingError';
    }
}

const NavigationBlockerContext = createContext<NavigationBlockerState | null>(
    null,
);

export function BlockableLink(properties: ComponentProps<typeof Link>) {
    const { isBlocked } = useNavigationBlocker();
    const { onNavigate } = properties;
    return (
        <Link
            {...properties}
            onNavigate={(event) => {
                if (isBlocked && !window.confirm(UNSAVED_CHANGES_PROMPT)) {
                    event.preventDefault();
                    return;
                }
                onNavigate?.(event);
            }}
        />
    );
}

export function NavigationBlockerProvider({
    children,
}: {
    readonly children: ReactNode;
}) {
    const [isBlocked, setIsBlocked] = useState(false);
    return (
        <NavigationBlockerContext value={{ isBlocked, setIsBlocked }}>
            {children}
        </NavigationBlockerContext>
    );
}

export function useBlockNavigationWhile(isUnsaved: boolean): void {
    const { setIsBlocked } = useNavigationBlocker();

    useEffect(() => {
        setIsBlocked(isUnsaved);
        if (!isUnsaved) return;
        const warnBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
        };
        window.addEventListener('beforeunload', warnBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', warnBeforeUnload);
            setIsBlocked(false);
        };
    }, [isUnsaved, setIsBlocked]);
}

function useNavigationBlocker(): NavigationBlockerState {
    const state = useContext(NavigationBlockerContext);
    if (!state) throw new NavigationBlockerMissingError();
    return state;
}
