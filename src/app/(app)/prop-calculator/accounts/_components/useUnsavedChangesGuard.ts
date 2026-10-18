import { type Route } from 'next';
import { type LinkProps } from 'next/link';
import { useEffect } from 'react';

type NavigateHandler = NonNullable<LinkProps<Route>['onNavigate']>;

export const UNSAVED_CHANGES_PROMPT =
    'You have unsaved changes. Leave this page and lose them?';

export function useUnsavedChangesGuard(isDirty: boolean): NavigateHandler {
    useEffect(() => {
        if (!isDirty) return;
        const holdUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
        };
        window.addEventListener('beforeunload', holdUnload);
        return () => {
            window.removeEventListener('beforeunload', holdUnload);
        };
    }, [isDirty]);

    return (event) => {
        if (isDirty && !window.confirm(UNSAVED_CHANGES_PROMPT)) {
            event.preventDefault();
        }
    };
}
