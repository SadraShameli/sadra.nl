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
        source: z.string().min(1).max(32).optional(),
    })
    .strict();

CredentialRegistry.instance.register({
    accountingProviderId: 'eboekhouden',
    id: CredentialKind.EBoekhouden,
    label: 'eBoekhouden',
    metaFields: [
        {
            defaultValue: 'sadranl',
            key: 'source',
            label: 'Source identifier',
            placeholder: 'sadranl',
            type: MetaFieldType.Text,
        },
    ],
    metaSchema,
    role: CredentialRole.Accounting,
    secret: {
        label: 'Access token',
        minLength: 16,
        placeholder: 'eyJxxx…',
    },
    tone: CredentialTone.Emerald,
});
