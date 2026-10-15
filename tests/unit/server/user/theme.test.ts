import { describe, expect, it, vi } from 'vitest';

import { ThemeSource } from '~/lib/theme';
import { themeRouter } from '~/server/api/routers/user/theme';
import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc';

import {
    assertInsertedForUser,
    assertUserScopedWhere,
    createFakeDatabase,
    type FakeRow,
    type IssuedQuery,
    writeTable,
} from '../fakeDatabase';

vi.mock('~/environment', () => ({ environment: { NODE_ENV: 'test' } }));
vi.mock('~/server/db', async () => {
    const schema = await import('~/server/db/schemas/theme');
    return { db: {}, userTheme: schema.userTheme };
});
vi.mock('~/lib/auth/server', () => ({
    auth: { api: { getSession: vi.fn() } },
}));
vi.mock('~/lib/email', () => ({}));
vi.mock('~/lib/notify', () => ({ scheduleFanOut: vi.fn() }));

const USER_ID = 'user-theme-owner';

const STORED_ROW: FakeRow = {
    name: 'Deep Purple',
    source: ThemeSource.Community,
    styles: {
        dark: {
            background: 'black',
            'font-sans': 'Inter, sans-serif',
            primary: 'white',
        },
        light: {
            background: 'white',
            'font-sans': 'Inter, sans-serif',
            primary: 'black',
        },
    },
    theme_id: 'deep-purple',
};

function callerWith(rows: FakeRow[]) {
    const { database, queries } = createFakeDatabase(() => rows);
    const caller = createCallerFactory(
        createTRPCRouter({ theme: themeRouter }),
    )({
        db: database,
        headers: new Headers(),
        session: {
            user: { email: 'owner@example.com', id: USER_ID, role: 'user' },
        } as never,
    });
    return { caller, queries };
}

function themeWrites(queries: IssuedQuery[]): IssuedQuery[] {
    return queries.filter(
        (query) => writeTable(query) === 'sadranl_user_theme',
    );
}

describe('user theme router', () => {
    it('reads only the caller theme and renders it', async () => {
        const { caller, queries } = callerWith([STORED_ROW]);
        const current = await caller.theme.current();
        const [read] = queries;
        expect(read).toBeDefined();
        if (read !== undefined) assertUserScopedWhere(read, USER_ID);
        expect(current?.css).toContain('html.dark{--background:black;');
        expect(current?.fonts).toEqual(['Inter']);
    });

    it('saves a selected preset for the caller only', async () => {
        const { caller, queries } = callerWith([]);
        const applied = await caller.theme.select({
            id: 'modern-minimal',
            source: ThemeSource.Preset,
        });
        expect(applied.id).toBe('modern-minimal');
        const [write] = themeWrites(queries);
        expect(write).toBeDefined();
        if (write !== undefined) assertInsertedForUser(write, USER_ID);
    });

    it('rejects a theme that is not in the catalog', async () => {
        const { caller } = callerWith([]);
        await expect(
            caller.theme.select({
                id: 'no-such-theme',
                source: ThemeSource.Community,
            }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('resets only the caller theme', async () => {
        const { caller, queries } = callerWith([]);
        await caller.theme.reset();
        const [write] = themeWrites(queries);
        expect(write).toBeDefined();
        if (write !== undefined) assertUserScopedWhere(write, USER_ID);
    });
});
