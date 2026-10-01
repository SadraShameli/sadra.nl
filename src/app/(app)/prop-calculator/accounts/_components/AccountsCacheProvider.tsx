'use client';

import { type ReactNode, useState } from 'react';

import { ComputationCache } from '~/app/(app)/prop-calculator/_components/computationCache';
import { ComputationCacheContext } from '~/app/(app)/prop-calculator/_components/useDebouncedSimulation';

const browserCache =
    typeof window === 'undefined' ? null : new ComputationCache();

export function AccountsCacheProvider({ children }: { readonly children: ReactNode }) {
    const [cache] = useState(() => browserCache ?? new ComputationCache());
    return (
        <ComputationCacheContext.Provider value={cache}>
            {children}
        </ComputationCacheContext.Provider>
    );
}
