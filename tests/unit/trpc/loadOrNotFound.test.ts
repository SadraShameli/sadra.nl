import { TRPCError } from '@trpc/server';
import { notFound, redirect } from 'next/navigation';
import { describe, expect, it } from 'vitest';

import { routes } from '~/lib/site/routes';
import { loadOrNotFound, routeIdOrNotFound } from '~/trpc/loadOrNotFound';

const NOT_FOUND_DIGEST = 'NEXT_HTTP_ERROR_FALLBACK;404';

async function caught(load: () => Promise<unknown>): Promise<unknown> {
    try {
        await loadOrNotFound(load);
    } catch (error) {
        return error;
    }
    throw new Error('loadOrNotFound resolved');
}

function digestOf(error: unknown): unknown {
    return error instanceof Error && 'digest' in error
        ? error.digest
        : undefined;
}

describe('loadOrNotFound', () => {
    it('returns what the loader resolves', async () => {
        await expect(
            loadOrNotFound(() => Promise.resolve('run')),
        ).resolves.toBe('run');
    });

    it('turns a tRPC NOT_FOUND into the not-found page', async () => {
        const error = await caught(() =>
            Promise.reject(new TRPCError({ code: 'NOT_FOUND' })),
        );
        expect(digestOf(error)).toBe(NOT_FOUND_DIGEST);
    });

    it('rethrows any other tRPC error so the error boundary shows', async () => {
        const failure = new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        await expect(caught(() => Promise.reject(failure))).resolves.toBe(
            failure,
        );
    });

    it('rethrows a plain error such as a database outage', async () => {
        const failure = new Error('connection refused');
        await expect(caught(() => Promise.reject(failure))).resolves.toBe(
            failure,
        );
    });

    it('rethrows a Next.js redirect from inside the loader', async () => {
        const error = await caught(async () => {
            await Promise.resolve();
            redirect(routes.auth.login);
        });
        expect(String(digestOf(error))).toMatch(/^NEXT_REDIRECT;/);
    });

    it('keeps a not-found raised inside the loader as not-found', async () => {
        const error = await caught(async () => {
            await Promise.resolve();
            notFound();
        });
        expect(digestOf(error)).toBe(NOT_FOUND_DIGEST);
    });
});

describe('routeIdOrNotFound', () => {
    it('returns a well-formed id unchanged', () => {
        const id = '00000000-0000-4000-8000-000000000001';
        expect(routeIdOrNotFound(id)).toBe(id);
    });

    it('sends a malformed id to the not-found page', () => {
        let error: unknown;
        try {
            routeIdOrNotFound('not-a-uuid');
        } catch (error_) {
            error = error_;
        }
        expect(digestOf(error)).toBe(NOT_FOUND_DIGEST);
    });
});
