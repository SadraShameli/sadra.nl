import 'server-only';
import { type Route } from 'next';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';

import { isRoot } from '~/lib/auth/roles';
import { type Session } from '~/lib/auth/server';
import { readSession } from '~/lib/auth/session';
import { routes } from '~/lib/site/routes';

export async function requireRootUser(): Promise<Session['user']> {
    const user = await requireSessionUser();
    if (!isRoot(user.role)) notFound();
    return user;
}

export async function requireSessionUser(
    loginRoute: Route = routes.auth.login,
): Promise<Session['user']> {
    const session = await readSession();
    if (!session?.user.id) redirect(loginRoute);
    await connection();
    return session.user;
}
