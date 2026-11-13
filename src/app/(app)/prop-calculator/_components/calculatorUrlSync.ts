import {
    isCalculatorInputsPath,
    pageOwnedParametersOnPath,
    pageStateBlobsOnPath,
} from './toolCatalog';
import { type CalculatorState } from './types';
import { encodeState, type EncodeStateOptions } from './urlState';

export function nextUrl(
    state: CalculatorState,
    pathname: string,
    currentSearch: string,
    currentHash: string,
    options?: EncodeStateOptions,
): null | string {
    if (!isCalculatorInputsPath(pathname)) return null;
    const parameters = encodeState(state, pageEncodeOptions(pathname, options));
    replacePageParameters(
        parameters,
        pageOwnedParametersOnPath(pathname),
        new URLSearchParams(currentSearch),
    );
    const encoded = parameters.toString();
    return canonicalSearch(currentSearch) === canonicalSearch(encoded)
        ? null
        : `${pathname}?${encoded}${currentHash}`;
}

export function pageEncodeOptions(
    pathname: string,
    options: EncodeStateOptions = {},
): EncodeStateOptions {
    return { ...options, pageBlobs: pageStateBlobsOnPath(pathname) };
}

export function replacePageParameters(
    target: URLSearchParams,
    owned: readonly string[],
    source: URLSearchParams,
): void {
    for (const name of owned) {
        const value = source.get(name);
        if (value === null) target.delete(name);
        else target.set(name, value);
    }
}

function canonicalSearch(search: string): string {
    return new URLSearchParams(search).toString();
}
