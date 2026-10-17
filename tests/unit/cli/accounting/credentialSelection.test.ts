import { describe, expect, it, vi } from 'vitest';

import { EboekhoudenCredentialResolver } from '~/cli/commands/accounting/EboekhoudenCredentialResolver';

import type { FakeRow } from '../../server/fakeDatabase';

const fake = vi.hoisted(() => ({ rows: [] as FakeRow[] }));

vi.mock('~/environment', () => ({ environment: { NODE_ENV: 'test' } }));
vi.mock('~/cli/ui', () => ({
    ui: { fail: vi.fn(), note: vi.fn() },
}));
vi.mock('~/server/db', async () => {
    const { databaseSchema } = await import('~/server/db/databaseSchema');
    const { createFakeDatabase } = await import('../../server/fakeDatabase');
    const { database } = createFakeDatabase(() => fake.rows);
    return { ...databaseSchema, db: database };
});

const ONLY_ROW: FakeRow = {
    ciphertext: 'sealed',
    created_at: new Date('2026-01-01T00:00:00Z'),
    id: 'only-id',
    is_active: true,
    kind: 'eboekhouden',
    label: 'Main administration',
    meta: {},
    updated_at: new Date('2026-01-01T00:00:00Z'),
    user_id: 'user-1',
};

describe('EboekhoudenCredentialResolver.resolveRow', () => {
    it('refuses an explicit target that does not match the only saved credential', async () => {
        fake.rows = [ONLY_ROW];

        await expect(
            EboekhoudenCredentialResolver.resolveRow('other-id'),
        ).resolves.toBeNull();
    });

    it('selects the only saved credential when no target is given', async () => {
        fake.rows = [ONLY_ROW];

        const row = await EboekhoudenCredentialResolver.resolveRow(undefined);

        expect(row?.id).toBe('only-id');
    });

    it('selects the saved credential an explicit label names', async () => {
        fake.rows = [ONLY_ROW];

        const row = await EboekhoudenCredentialResolver.resolveRow(
            'main administration',
        );

        expect(row?.id).toBe('only-id');
    });
});
