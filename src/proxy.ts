import { getSessionCookie } from 'better-auth/cookies';
import { type NextRequest, NextResponse } from 'next/server';

import { legacyQueryRedirect } from '~/lib/site/legacyCalculatorLinks';
import { isPrivatePath, loginRedirectFor } from '~/lib/site/privateRoutes';

const TEMPORARY_REDIRECT_STATUS = 307;

export interface ProxyRedirect {
    location: string;
    status: number;
}

export default function middleware(request: NextRequest) {
    const { pathname, search } = request.nextUrl;
    const redirect = proxyRedirect(
        pathname,
        search,
        getSessionCookie(request) !== null,
    );
    return redirect === null
        ? NextResponse.next()
        : NextResponse.redirect(
              new URL(redirect.location, request.url),
              redirect.status,
          );
}

export function proxyRedirect(
    pathname: string,
    search: string,
    hasSession: boolean,
): null | ProxyRedirect {
    const legacyLocation = legacyQueryRedirect(pathname, search);
    if (legacyLocation !== null) return temporaryRedirect(legacyLocation);
    return hasSession || !isPrivatePath(pathname)
        ? null
        : temporaryRedirect(loginRedirectFor(pathname, search));
}

export const config = {
    matcher: ['/((?!_next|favicon.ico|.*[.].*).*)'],
};

function temporaryRedirect(location: string): ProxyRedirect {
    return { location, status: TEMPORARY_REDIRECT_STATUS };
}
