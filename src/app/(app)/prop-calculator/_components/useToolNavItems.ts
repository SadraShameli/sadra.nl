'use client';

import { useMemo } from 'react';

import { type RouteSubnavItem } from '~/app/(app)/_components/RouteSubnav';

import { useCalculatorInputs } from './CalculatorProvider';
import { toolNavItems } from './toolNavItems';

export function useToolNavItems(): readonly RouteSubnavItem[] {
    const { debouncedQuery } = useCalculatorInputs();
    return useMemo(() => toolNavItems(debouncedQuery), [debouncedQuery]);
}
