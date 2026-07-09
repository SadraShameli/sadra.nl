import { z } from 'zod';

import {
    CredentialKind,
    CredentialRegistry,
    CredentialRole,
    CredentialTone,
    MetaFieldType,
} from '~/lib/accounting/credentials/registry';

const metaSchema = z
    .object({
        profileId: z.coerce.number().int().positive(),
        sandbox: z.boolean().optional(),
    })
    .strict();

CredentialRegistry.instance().register({
    id: CredentialKind.Wise,
    label: 'Wise',
    metaFields: [
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
    tone: CredentialTone.Sky,
    transactionSourceId: 'wise-api',
});
