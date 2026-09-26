import { z } from 'zod';

import { routes, withQuery } from '~/lib/site/routes';

export const callbackUrlSchema = z
    .string()
    .max(512)
    .regex(/^\/(?![/\\])[^\\\p{Cc}]*$/u, 'Must be a same-origin path');

export const PRIVATE_PREFIXES: readonly string[] = [
    routes.profile,
    routes.tradeChecklist.index,
    routes.propCalculator.accounts.index,
];

export function isPrivatePath(pathname: string): boolean {
    return PRIVATE_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
}

export function loginRedirectFor(pathname: string, search = ''): string {
    const query = search.startsWith('?') ? search.slice(1) : search;
    const candidates =
        query === '' ? [pathname] : [`${pathname}?${query}`, pathname];
    const callbackUrl = candidates.find(
        (candidate) => callbackUrlSchema.safeParse(candidate).success,
    );
    return withQuery(routes.auth.login, { callbackUrl });
}

export function readCallbackUrl(
    searchParameters: Pick<URLSearchParams, 'get'>,
): string {
    return callbackUrlSchema
        .catch(routes.home)
        .parse(searchParameters.get('callbackUrl'));
}
