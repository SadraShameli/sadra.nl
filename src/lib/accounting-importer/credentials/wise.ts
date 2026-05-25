import { z } from 'zod';

import { registerCredentialDescriptor } from './registry';

const metaSchema = z
    .object({
        profileId: z.coerce.number().int().positive(),
        sandbox: z.boolean().optional(),
    })
    .strict();

registerCredentialDescriptor({
    id: 'wise',
    label: 'Wise',
    metaFields: [
        {
            defaultValue: false,
            key: 'sandbox',
            label: 'Sandbox',
            type: 'boolean',
        },
        {
            key: 'profileId',
            label: 'Profile',
            required: true,
            type: 'select',
        },
    ],
    metaSchema,
    role: 'transactions',
    secret: {
        label: 'API token',
        minLength: 16,
        placeholder: 'wise-…',
    },
    tone: 'sky',
    transactionSourceId: 'wise-api',
});
