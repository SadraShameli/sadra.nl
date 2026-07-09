import { describe, expect, it, vi } from 'vitest';

import type { ContactsResource } from '~/lib/accounting/providers/moneybird/resources';

import { MoneybirdContactResolver } from '~/lib/accounting/providers/moneybird/contact-resolver';

function fakeContacts(
    existing: null | { companyName: null | string; id: string },
) {
    const create = vi
        .fn()
        .mockResolvedValue({ companyName: 'New Co', id: 'created-1' });
    const findByCompanyName = vi.fn().mockResolvedValue(existing);
    return {
        contacts: { create, findByCompanyName } as unknown as ContactsResource,
        create,
        findByCompanyName,
    };
}

describe('MoneybirdContactResolver', () => {
    it('reuses an existing contact instead of creating a new one', async () => {
        const { contacts, create } = fakeContacts({
            companyName: 'Acme',
            id: 'existing-1',
        });
        const resolver = new MoneybirdContactResolver(contacts);

        const id = await resolver.resolve('Acme');

        expect(id).toBe('existing-1');
        expect(create).not.toHaveBeenCalled();
    });

    it('creates a contact when none exists', async () => {
        const { contacts, create } = fakeContacts(null);
        const resolver = new MoneybirdContactResolver(contacts);

        const id = await resolver.resolve('New Co');

        expect(id).toBe('created-1');
        expect(create).toHaveBeenCalledWith({ companyName: 'New Co' });
    });

    it('only searches once per name across repeated calls within a session', async () => {
        const { contacts, findByCompanyName } = fakeContacts({
            companyName: 'Acme',
            id: 'existing-1',
        });
        const resolver = new MoneybirdContactResolver(contacts);

        await resolver.resolve('Acme');
        await resolver.resolve('Acme');

        expect(findByCompanyName).toHaveBeenCalledTimes(1);
    });

    it('keeps separate cache entries per counterpart name', async () => {
        const { contacts, findByCompanyName } = fakeContacts({
            companyName: 'Acme',
            id: 'existing-1',
        });
        const resolver = new MoneybirdContactResolver(contacts);

        await resolver.resolve('Acme');
        await resolver.resolve('Other Co');

        expect(findByCompanyName).toHaveBeenCalledTimes(2);
    });
});
