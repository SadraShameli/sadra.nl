import { z } from 'zod';

import { CredentialRegistry } from '~/lib/accounting/credentials/registry';

const metaSchema = z
    .object({
        source: z.string().min(1).max(32).optional(),
    })
    .strict();

CredentialRegistry.instance().register({
    accountingProviderId: 'eboekhouden',
    id: 'eboekhouden',
    label: 'eBoekhouden',
    metaFields: [
        {
            defaultValue: 'sadranl',
            key: 'source',
            label: 'Source identifier',
            placeholder: 'sadranl',
            type: 'text',
        },
    ],
    metaSchema,
    role: 'accounting',
    secret: {
        label: 'Access token',
        minLength: 16,
        placeholder: 'eyJxxx…',
    },
    tone: 'emerald',
});
