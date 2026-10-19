import { type UserRow } from '~/cli/commands/prop/userByEmail';
import { type Session } from '~/lib/auth/server';
import { SITE_NAME } from '~/lib/site/siteName';
import { createCaller } from '~/server/api/root';
import { type ContextType } from '~/server/api/trpc';

export type PropAccountsCaller = ReturnType<typeof propAccountsCallerFor>;

const CLI_SESSION_TTL_MS = 60 * 60 * 1000;

export function propAccountsCallerFor(
    database: ContextType['db'],
    owner: UserRow,
) {
    const now = new Date();
    const session: Session = {
        session: {
            createdAt: now,
            expiresAt: new Date(now.getTime() + CLI_SESSION_TTL_MS),
            id: 'cli',
            ipAddress: null,
            token: 'cli',
            updatedAt: now,
            userAgent: `${SITE_NAME} cli`,
            userId: owner.id,
        },
        user: owner,
    };
    return createCaller({ db: database, headers: new Headers(), session })
        .propAccounts;
}
