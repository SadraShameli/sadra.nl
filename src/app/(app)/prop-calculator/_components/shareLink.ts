import { type CalculatorState } from './types';
import { encodeState, type EncodeStateOptions } from './urlState';

export function buildShareLink(
    origin: string,
    pathname: string,
    state: CalculatorState,
    options: EncodeStateOptions,
): string {
    return shareLinkForQuery(
        origin,
        pathname,
        encodeState(state, options).toString(),
    );
}

export function shareLinkForQuery(
    origin: string,
    pathname: string,
    query: string,
): string {
    const bare = query.startsWith('?') ? query.slice(1) : query;
    return bare === ''
        ? `${origin}${pathname}`
        : `${origin}${pathname}?${bare}`;
}
