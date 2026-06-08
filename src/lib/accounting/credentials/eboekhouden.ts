import { z } from 'zod';

import { registerCredentialDescriptor } from './registry';

const metaSchema = z
    .object({
        source: z.string().min(1).max(32).optional(),
    })
    .strict();

registerCredentialDescriptor({
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
