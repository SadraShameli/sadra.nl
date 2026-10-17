import 'server-only';
import type { BetterAuthOptions } from 'better-auth';

import { logger } from '~/lib/observability/logger';

type DatabaseHooks = NonNullable<BetterAuthOptions['databaseHooks']>;

export const authAuditHooks = {
    account: {
        create: {
            after: (account, context) => {
                logger.info('[auth.audit] account linked', {
                    path: context?.path,
                    providerId: account.providerId,
                    userId: account.userId,
                });
                return Promise.resolve();
            },
        },
    },
    session: {
        create: {
            after: (session, context) => {
                logger.info('[auth.audit] session created', {
                    impersonatedBy: session.impersonatedBy,
                    path: context?.path,
                    userId: session.userId,
                });
                return Promise.resolve();
            },
        },
    },
    user: {
        update: {
            after: (user, context) => {
                logger.info('[auth.audit] user updated', {
                    path: context?.path,
                    userId: user.id,
                });
                return Promise.resolve();
            },
        },
    },
} satisfies DatabaseHooks;
