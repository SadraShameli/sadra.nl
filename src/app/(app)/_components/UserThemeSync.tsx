'use client';

import { useEffect } from 'react';

import { applyBrowserTheme, storedBrowserTheme } from '~/lib/theme';
import { api } from '~/trpc/react';

export function UserThemeSync({ signedIn }: { readonly signedIn: boolean }) {
    const current = api.user.theme.current.useQuery(undefined, {
        enabled: signedIn,
        staleTime: Infinity,
    });
    const theme = signedIn ? current.data : null;
    useEffect(() => {
        if (theme === undefined || theme?.css === storedBrowserTheme()?.css)
            return;
        applyBrowserTheme(theme);
    }, [theme]);
    return null;
}
