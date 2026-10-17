import 'server-only';
import type { BetterAuthOptions } from 'better-auth';

import {
    type Fields,
    logger,
    serializeError,
} from '~/lib/observability/logger';

type AuthLogger = NonNullable<BetterAuthOptions['logger']>;
type AuthLogLevel = Parameters<NonNullable<AuthLogger['log']>>[0];

function describedDetail(detail: unknown): unknown {
    return detail instanceof Error ? serializeError(detail) : detail;
}

function write(level: AuthLogLevel, message: string, details: Fields): void {
    switch (level) {
        case 'debug': {
            logger.debug(message, details);
            return;
        }
        case 'error': {
            logger.error(message, details);
            return;
        }
        case 'info': {
            logger.info(message, details);
            return;
        }
        case 'warn': {
            logger.warn(message, details);
            return;
        }
    }
}

export const authLogger = {
    log: (
        level: AuthLogLevel,
        message: string,
        ...details: unknown[]
    ): void => {
        write(level, `[auth] ${message}`, {
            details: details.map((detail) => describedDetail(detail)),
        });
    },
} satisfies AuthLogger;
