import { eq } from 'drizzle-orm';

import { selectCredentialRow } from '~/cli/commands/accounting/CredentialSelection';
import { ui } from '~/cli/ui';
import { CredentialKind } from '~/lib/accounting/credentials/registry';
import { EBoekhoudenClient } from '~/lib/accounting/providers/eboekhouden/client';
import { openSecret } from '~/lib/crypto/secrets';
import { accountingCredential, db } from '~/server/db';

export type EboekhoudenCredentialRow = typeof accountingCredential.$inferSelect;

export const EboekhoudenCredentialResolver = {
    async openClient(
        row: EboekhoudenCredentialRow,
    ): Promise<EBoekhoudenClient> {
        if (!row.ciphertext) {
            throw new Error(`Credential "${row.label}" has no stored secret.`);
        }
        const secret = await openSecret(row.ciphertext);
        const source =
            typeof row.meta.source === 'string' ? row.meta.source : 'sadranl';
        const client = new EBoekhoudenClient(secret, { source });
        await client.openSession();
        return client;
    },

    async resolveRow(
        credentialArgument: string | undefined,
    ): Promise<EboekhoudenCredentialRow | null> {
        const rows = await db
            .select()
            .from(accountingCredential)
            .where(eq(accountingCredential.kind, CredentialKind.EBoekhouden));

        const row = selectCredentialRow(
            rows,
            credentialArgument,
            'eBoekhouden',
        );
        if (row === null) return null;

        if (!row.ciphertext) {
            ui.fail(`Credential "${row.label}" has no stored secret.`);
            return null;
        }

        return row;
    },
};
