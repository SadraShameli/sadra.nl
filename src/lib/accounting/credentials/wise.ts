import { z } from 'zod';

import {
    CredentialKind,
    CredentialRegistry,
    CredentialRole,
    MetaFieldType,
} from '~/lib/accounting/credentials/registry';

const metaSchema = z
    .object({
        includeIncoming: z.boolean().optional(),
        profileId: z.coerce.number().int().positive(),
        sandbox: z.boolean().optional(),
    })
    .strict();

CredentialRegistry.instance.register({
    id: CredentialKind.Wise,
    label: 'Wise',
    metaFields: [
        {
            defaultValue: false,
            description:
                'Also import incoming transfers (payouts). Leave off where a payout CSV already covers the same money.',
            key: 'includeIncoming',
            label: 'Import incoming transfers',
            type: MetaFieldType.Boolean,
        },
        {
            defaultValue: false,
            key: 'sandbox',
            label: 'Sandbox',
            type: MetaFieldType.Boolean,
        },
        {
            key: 'profileId',
            label: 'Profile',
            required: true,
            type: MetaFieldType.Select,
        },
    ],
    metaSchema,
    role: CredentialRole.Transactions,
    secret: {
        label: 'API token',
        minLength: 16,
        placeholder: 'wise-…',
    },
    transactionSourceId: 'wise-api',
});
