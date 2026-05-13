import { auth } from '~/lib/auth';

const PRIVATE_PREFIXES = ['/profile', '/trade-checklist'];

export default auth((req) => {
    const { pathname } = req.nextUrl;
    const isPrivate = PRIVATE_PREFIXES.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
    if (isPrivate && !req.auth) {
        const url = new URL('/login', req.url);
        url.searchParams.set('callbackUrl', pathname);
        return Response.redirect(url);
    }
});

export const config = {
    matcher: [String.raw`/((?!_next|favicon.ico|.*\..*).*)`],
};
