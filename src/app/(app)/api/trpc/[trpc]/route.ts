import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { type NextRequest } from 'next/server';

import { env } from '~/env';
import { logger } from '~/lib/observability/logger';
import { appRouter } from '~/server/api/root';
import { createTRPCContext } from '~/server/api/trpc';

const createContext = async (req: NextRequest) => {
    return createTRPCContext({
        headers: req.headers,
    });
};

const handler = (req: NextRequest) =>
    fetchRequestHandler({
        createContext: () => createContext(req),
        endpoint: '/api/trpc',
        onError:
            env.NODE_ENV === 'development'
                ? ({ error, path }) => {
                      const cause = error.cause;
                      logger.error(`tRPC failed on ${path ?? '<no-path>'}`, {
                          causeMessage:
                              cause instanceof Error
                                  ? cause.message
                                  : undefined,
                          causeName:
                              cause instanceof Error ? cause.name : undefined,
                          code: error.code,
                          message: error.message,
                      });
                  }
                : undefined,
        req,
        router: appRouter,
    });

export { handler as GET, handler as POST };
