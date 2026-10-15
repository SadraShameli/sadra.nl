import { cacheLife } from 'next/cache';

import { getServerSession } from '~/lib/auth/server';

import { AccountLink } from './AccountLink';

export async function SessionAccountLink() {
    return <AccountLink signedIn={await isSignedIn()} />;
}

async function isSignedIn(): Promise<boolean> {
    'use cache: private';
    cacheLife('minutes');
    const session = await getServerSession();
    return Boolean(session?.user.id);
}
