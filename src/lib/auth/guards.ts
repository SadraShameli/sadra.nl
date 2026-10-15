import 'server-only';
import { type Route } from 'next';
import { notFound, redirect } from 'next/navigation';

import { isRoot } from '~/lib/auth/roles';
import { getServerSession, type Session } from '~/lib/auth/server';
import { routes } from '~/lib/site/routes';

export async function requireSessionUser(
    loginRoute: Route = routes.auth.login,
): Promise<Session['user']> {
    const session = await getServerSession();
    if (!session?.user.id) redirect(loginRoute);
    return session.user;
}

export async function requireRootUser(): Promise<Session['user']> {
    const user = await requireSessionUser();
    if (!isRoot(user.role)) notFound();
    return user;
}
