import {
    legacySectionRoute,
    type LegacySectionTarget,
} from '~/lib/site/legacyCalculatorLinks';

import { isCalculatorInputsPath } from './toolCatalog';
import { type CalculatorState } from './types';
import { encodeState, type EncodeStateOptions } from './urlState';

export interface LegacyHashNavigation extends LegacySectionTarget {
    target: string;
}

export interface LegacyHashReplacement extends LegacyHashNavigation {
    from: string;
}

export function isLegacyHashSettled(
    isMounted: boolean,
    pending: LegacyHashReplacement | null,
    pathname: string,
): boolean {
    return isMounted && stillPendingLegacyHash(pending, pathname) === null;
}

export function legacyHashNavigation(
    state: CalculatorState,
    pathname: string,
    hash: string,
    options?: EncodeStateOptions,
): LegacyHashNavigation | null {
    const section = legacySectionRoute(hash, pathname);
    return section === null
        ? null
        : {
              ...section,
              target: `${section.route}?${encodeState(state, options).toString()}#${section.fragment}`,
          };
}

export function legacyHashReplacement(
    state: CalculatorState,
    pathname: string,
    hash: string,
    options?: EncodeStateOptions,
): LegacyHashReplacement | null {
    const navigation = legacyHashNavigation(state, pathname, hash, options);
    return navigation === null ? null : { ...navigation, from: pathname };
}

export function nextUrl(
    state: CalculatorState,
    pathname: string,
    currentSearch: string,
    currentHash: string,
    options?: EncodeStateOptions,
): null | string {
    if (!isCalculatorInputsPath(pathname)) return null;
    const encoded = encodeState(state, options).toString();
    return canonicalSearch(currentSearch) === canonicalSearch(encoded)
        ? null
        : `${pathname}?${encoded}${currentHash}`;
}

export function stillPendingLegacyHash(
    pending: LegacyHashReplacement | null,
    pathname: string,
): LegacyHashReplacement | null {
    return pending !== null && pathname === pending.from ? pending : null;
}

function canonicalSearch(search: string): string {
    return new URLSearchParams(search).toString();
}
