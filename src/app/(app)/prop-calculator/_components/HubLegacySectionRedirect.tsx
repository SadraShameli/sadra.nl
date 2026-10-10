'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { readLastToolQuery } from './lastToolQuery';
import {
    hubLegacyTarget,
    watchLegacyFragmentScroll,
} from './legacyFragmentScroll';

export function HubLegacySectionRedirect() {
    const router = useRouter();

    useEffect(() => {
        const target = hubLegacyTarget(
            window.location.hash,
            window.location.search,
            readLastToolQuery() ?? undefined,
        );
        if (target === null) return;
        watchLegacyFragmentScroll(target.fragment, target.route);
        router.replace(target.href);
    }, [router]);

    return null;
}
