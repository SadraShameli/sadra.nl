import { afterEach, describe, expect, it, vi } from 'vitest';

import { eboekhoudenProvider } from '~/lib/accounting/providers/eboekhouden/provider';

const SESSION_TOKEN = 'token-scoped-session';
const UNAUTHENTICATED = 401;

class TokenScopedServer {
    private isOpen = false;
    deletes = 0;
    opens = 0;

    respond(input: Request | string | URL, init?: RequestInit): Response {
        const url = new URL(input instanceof Request ? input.url : input);
        const method = init?.method ?? 'GET';
        if (url.pathname.endsWith('/session')) {
            if (method === 'DELETE') {
                this.deletes += 1;
                this.isOpen = false;
                return new Response(null, { status: 204 });
            }
            this.opens += 1;
            this.isOpen = true;
            return Response.json({ expiresIn: 3600, token: SESSION_TOKEN });
        }
        return this.isOpen
            ? Response.json({ items: [] })
            : Response.json(
                  { code: 'SECURITY_010', title: 'Not authenticated' },
                  { status: UNAUTHENTICATED },
              );
    }
}

function serve(): TokenScopedServer {
    const server = new TokenScopedServer();
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
        Promise.resolve(server.respond(input, init)),
    );
    return server;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('eBoekhouden sessions opened at the same time with one access token', () => {
    it('keeps one caller working after another closes its session', async () => {
        serve();
        const [first, second] = await Promise.all([
            eboekhoudenProvider.openSession({ secret: 'access-token' }),
            eboekhoudenProvider.openSession({ secret: 'access-token' }),
        ]);

        await first.close();

        await expect(second.listLedgers()).resolves.toEqual([]);
        await second.close();
    });

    it('opens the provider session once and deletes it after the last caller', async () => {
        const server = serve();
        const [first, second] = await Promise.all([
            eboekhoudenProvider.openSession({ secret: 'access-token' }),
            eboekhoudenProvider.openSession({ secret: 'access-token' }),
        ]);

        await first.close();
        expect(server.deletes).toBe(0);
        await second.close();

        expect(server.opens).toBe(1);
        expect(server.deletes).toBe(1);
    });

    it('opens a fresh session once every earlier caller has closed', async () => {
        const server = serve();
        const first = await eboekhoudenProvider.openSession({
            secret: 'access-token',
        });
        await first.close();

        const next = await eboekhoudenProvider.openSession({
            secret: 'access-token',
        });

        await expect(next.listLedgers()).resolves.toEqual([]);
        await next.close();
        expect(server.opens).toBe(2);
    });
});
