'use client';

import { useCallback, useMemo } from 'react';

import { api } from '~/trpc/react';

export interface TaxCodeOption {
    code: string;
    label: string;
}

export function useTaxCodes(credentialId: string) {
    const query = api.accounting.taxCodes.list.useQuery(
        { credentialId },
        { enabled: !!credentialId },
    );
    const options = useMemo(() => query.data ?? [], [query.data]);
    const labelByCode = useMemo(() => {
        const map = new Map<string, string>();
        for (const o of options) map.set(o.code, o.label);
        return map;
    }, [options]);
    const labelOf = useCallback(
        (code: string): string => labelByCode.get(code) ?? code,
        [labelByCode],
    );

    return { isPending: query.isPending, labelOf, options };
}
