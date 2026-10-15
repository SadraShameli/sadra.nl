import { type Route } from 'next';

import {
    type PathWithQuery,
    routes,
    sameOriginRouteSchema,
    withQuery,
} from '~/lib/site/routes';

const CALLBACK_URL_MAX_LENGTH = 512;

export const callbackUrlSchema = sameOriginRouteSchema.refine(
    (route) => route.length <= CALLBACK_URL_MAX_LENGTH,
    'Callback URL is too long',
);

export const PRIVATE_PREFIXES: readonly string[] = [
    routes.accounting.index,
    routes.lifting.index,
    routes.profile,
    routes.tradeChecklist.index,
    routes.propCalculator.accounts.index,
];

export function currentCallbackUrl(): Route {
    return readCallbackUrl(new URLSearchParams(window.location.search));
}

export function isPrivatePath(pathname: string): boolean {
    return PRIVATE_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
}

export function loginRedirectFor(
    pathname: string,
    search = '',
): PathWithQuery<typeof routes.auth.login> {
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
): Route {
    return callbackUrlSchema
        .catch(routes.home)
        .parse(searchParameters.get('callbackUrl'));
}
