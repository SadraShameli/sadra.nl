'use client';

import { useRef } from 'react';

type AutoFocusHandler = (event: Event) => void;

export function useReturnFocus({
    onCloseAutoFocus,
    onOpenAutoFocus,
}: {
    readonly onCloseAutoFocus?: AutoFocusHandler;
    readonly onOpenAutoFocus?: AutoFocusHandler;
}): { onCloseAutoFocus: AutoFocusHandler; onOpenAutoFocus: AutoFocusHandler } {
    const openerReference = useRef<HTMLElement | null>(null);
    return {
        onCloseAutoFocus: (event) => {
            onCloseAutoFocus?.(event);
            const opener = openerReference.current;
            openerReference.current = null;
            if (event.defaultPrevented || !opener?.isConnected) return;
            event.preventDefault();
            opener.focus();
        },
        onOpenAutoFocus: (event) => {
            const active = document.activeElement;
            openerReference.current =
                active instanceof HTMLElement && active !== document.body
                    ? active
                    : null;
            onOpenAutoFocus?.(event);
        },
    };
}
