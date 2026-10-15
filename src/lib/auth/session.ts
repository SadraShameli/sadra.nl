import 'server-only';
import { cacheLife } from 'next/cache';

import { getServerSession, type Session } from '~/lib/auth/server';

export interface SessionView {
    readonly user: Session['user'];
}

export async function readSession(): Promise<null | SessionView> {
    'use cache: private';
    cacheLife('minutes');
    const session = await getServerSession();
    return session === null ? null : { user: session.user };
}
