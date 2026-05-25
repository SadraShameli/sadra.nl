import { getSessionCookie } from 'better-auth/cookies';
import { type NextRequest, NextResponse } from 'next/server';

import { routes } from '~/lib/site/routes';

const PRIVATE_PREFIXES = [routes.profile, routes.tradeChecklist.index];

export default function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;
    const isPrivate = PRIVATE_PREFIXES.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
    if (!isPrivate) return NextResponse.next();

    const cookie = getSessionCookie(req);
    if (!cookie) {
        const url = new URL(routes.auth.login, req.url);
        url.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(url);
    }
    return NextResponse.next();
}

export const config = {
    // eslint-disable-next-line unicorn/prefer-string-raw
    matcher: ['/((?!_next|favicon.ico|.*\\..*).*)'],
};
