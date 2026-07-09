import type { ContactsResource } from '~/lib/accounting/providers/moneybird/resources';

export class MoneybirdContactResolver {
    private readonly cache = new Map<string, string>();

    constructor(private readonly contacts: ContactsResource) {}

    async resolve(companyName: string): Promise<string> {
        const cached = this.cache.get(companyName);
        if (cached) return cached;

        const existing = await this.contacts.findByCompanyName(companyName);
        const contact =
            existing ?? (await this.contacts.create({ companyName }));
        this.cache.set(companyName, contact.id);
        return contact.id;
    }
}
