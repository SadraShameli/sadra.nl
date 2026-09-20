import { inArray } from 'drizzle-orm';

import type { ProviderSession } from '~/lib/accounting/providers/provider';

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

        const [onlyRow] = rows;
        if (!onlyRow || rows.length === 0) {
            ui.fail('No accounting credential found in the database.');
            return null;
        }

        let row = onlyRow;
        if (rows.length > 1) {
            const match = credentialArgument
                ? rows.find(
                      (r) =>
                          r.id === credentialArgument ||
                          r.label.toLowerCase() ===
                              credentialArgument.toLowerCase(),
                  )
                : undefined;
            if (!match) {
                ui.fail(
                    'Multiple accounting credentials found — pass --credential <id|label>:',
                );
                for (const r of rows) ui.note(`${r.label}  (${r.id})`);
                return null;
            }
            row = match;
        }

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
