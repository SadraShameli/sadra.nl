import { getServerSession } from '~/lib/auth/server';

import { AccountLink } from './AccountLink';

export async function SessionAccountLink() {
    const session = await getServerSession();
    return <AccountLink signedIn={Boolean(session?.user.id)} />;
}
