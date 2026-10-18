'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { sameOriginRoute } from '~/lib/site/routes';

const FLASH_PARAMETER = 'success';

export function FlashToast({ message }: { readonly message: string }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParameters = useSearchParams();
    const shownReference = useRef(false);

    useEffect(() => {
        if (shownReference.current) return;
        shownReference.current = true;
        toast.success(message);
        const query = new URLSearchParams(searchParameters.toString());
        query.delete(FLASH_PARAMETER);
        router.replace(sameOriginRoute(pathname, query.toString()), {
            scroll: false,
        });
    }, [message, pathname, router, searchParameters]);

    return null;
}
