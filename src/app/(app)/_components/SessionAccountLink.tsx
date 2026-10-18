import { readSession } from '~/lib/auth/session';

import { AccountLink } from './AccountLink';

export async function SessionAccountLink() {
    const session = await readSession();
    return <AccountLink signedIn={Boolean(session?.user.id)} />;
}
