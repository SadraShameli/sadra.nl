import { z } from 'zod';

import { CredentialRegistry } from '~/lib/accounting/credentials/registry';

const metaSchema = z
    .object({
        counterpartName: z.string().min(1).max(64),
    })
    .strict();

CredentialRegistry.instance().register({
    id: 'plane',
    label: 'Plane.com (CSV)',
    metaFields: [
        {
            key: 'counterpartName',
            label: 'Payer',
            required: true,
            type: 'select',
        },
    ],
    metaSchema,
    requiresSecret: false,
    role: 'transactions',
    tone: 'violet',
    transactionSourceId: 'plane-csv',
    transactionSourceKind: 'file',
});
