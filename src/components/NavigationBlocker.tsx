'use client';

import Link from 'next/link';
import {
    type ComponentProps,
    createContext,
    type ReactNode,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react';

import { ConfirmDialog } from '~/components/ui/confirm-dialog';

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

export function BlockableLink({
    onNavigate,
    ...properties
}: ComponentProps<typeof Link>) {
    const { isBlocked } = useNavigationBlocker();
    const linkReference = useRef<HTMLAnchorElement>(null);
    const leaveApproval = useRef(false);
    const [isConfirming, setIsConfirming] = useState(false);
    return (
        <>
            <Link
                {...properties}
                onNavigate={(event) => {
                    if (isBlocked && !leaveApproval.current) {
                        event.preventDefault();
                        setIsConfirming(true);
                        return;
                    }
                    leaveApproval.current = false;
                    onNavigate?.(event);
                }}
                ref={linkReference}
            />
            <ConfirmDialog
                confirmLabel="Leave"
                description="You have unsaved changes. Leaving now discards them."
                onConfirm={() => {
                    leaveApproval.current = true;
                    linkReference.current?.click();
                }}
                onOpenChange={setIsConfirming}
                open={isConfirming}
                title="Leave without saving?"
            />
        </>
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
