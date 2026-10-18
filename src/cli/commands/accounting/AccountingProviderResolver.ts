import { inArray } from 'drizzle-orm';

import type { ProviderSession } from '~/lib/accounting/providers/provider';

import '~/lib/accounting/providers/index';
import { selectCredentialRow } from '~/cli/commands/accounting/CredentialSelection';
import { ui } from '~/cli/ui';
import {
    CredentialRegistry,
    CredentialRole,
} from '~/lib/accounting/credentials/index';
import { ProviderRegistry } from '~/lib/accounting/providers/provider';
import { openSecret } from '~/lib/crypto/secrets';
import { accountingCredential, db } from '~/server/db';

export interface ResolvedAccountingSession {
    label: string;
    session: ProviderSession;
}

export const AccountingProviderResolver = {
    async openSession(
        credentialArgument: string | undefined,
    ): Promise<null | ResolvedAccountingSession> {
        const accountingKinds = CredentialRegistry.instance
            .listByRole(CredentialRole.Accounting)
            .map((d) => d.id);

        const rows = await db
            .select()
            .from(accountingCredential)
            .where(inArray(accountingCredential.kind, accountingKinds));

        const row = selectCredentialRow(rows, credentialArgument, 'accounting');
        if (row === null) return null;

        if (!row.ciphertext) {
            ui.fail(`Credential "${row.label}" has no stored secret.`);
            return null;
        }

        const descriptor = CredentialRegistry.instance.get(row.kind);
        if (!descriptor?.accountingProviderId) {
            ui.fail(
                `Credential kind "${row.kind}" has no accounting provider attached.`,
            );
            return null;
        }
        const provider = ProviderRegistry.instance().get(
            descriptor.accountingProviderId,
        );
        if (!provider) {
            ui.fail(
                `Accounting provider "${descriptor.accountingProviderId}" not registered.`,
            );
            return null;
        }

        const secret = await openSecret(row.ciphertext);
        const session = await provider.openSession({
            meta: row.meta,
            secret,
        });
        return { label: row.label, session };
    },
};
