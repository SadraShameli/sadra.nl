import { readSession } from '~/lib/auth/session';

import { UserThemeSync } from './UserThemeSync';

export async function SessionThemeSync() {
    const session = await readSession();
    return <UserThemeSync signedIn={session !== null} />;
}
