'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { Alert, type AlertProperties } from '~/components/ui/Alert';
import { sameOriginRoute } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

const AUTO_DISMISS_PARAMS = ['success', 'error'];
const DEFAULT_DISMISS_MS = 3000;
const FADE_DURATION_MS = 300;

type AutoDismissAlertProperties = AlertProperties & {
    dismissMs?: number;
};

export function AutoDismissAlert({
    className,
    dismissMs = DEFAULT_DISMISS_MS,
    ...properties
}: AutoDismissAlertProperties) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParameters = useSearchParams();
    const [isVisible, setIsVisible] = React.useState(true);
    const [isMounted, setIsMounted] = React.useState(true);

    React.useEffect(() => {
        const fade = setTimeout(() => setIsVisible(false), dismissMs);
        const unmount = setTimeout(() => {
            setIsMounted(false);
            const sp = new URLSearchParams(searchParameters.toString());
            let isChanged = false;
            for (const key of AUTO_DISMISS_PARAMS) {
                if (!sp.has(key)) {
                    continue;
                }

                sp.delete(key);
                isChanged = true;
            }
            if (!isChanged) return;
            const query = sp.toString();
            router.replace(sameOriginRoute(pathname, query), {
                scroll: false,
            });
        }, dismissMs + FADE_DURATION_MS);
        return () => {
            clearTimeout(fade);
            clearTimeout(unmount);
        };
    }, [dismissMs, pathname, router, searchParameters]);

    return isMounted ? (
        <Alert
            className={cn(
                'btn-transition ease-out',
                isVisible
                    ? 'translate-y-0 opacity-100'
                    : '-translate-y-1 opacity-0',
                className,
            )}
            {...properties}
        />
    ) : null;
}
