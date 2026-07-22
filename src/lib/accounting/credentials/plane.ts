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
        counterpartName: z.string().min(1).max(64),
    })
    .strict();

CredentialRegistry.instance.register({
    id: CredentialKind.Plane,
    label: 'Plane.com (CSV)',
    metaFields: [
        {
            key: 'counterpartName',
            label: 'Payer',
            required: true,
            type: MetaFieldType.Select,
        },
    ],
    metaSchema,
    requiresSecret: false,
    role: CredentialRole.Transactions,
    tone: CredentialTone.Violet,
    transactionSourceId: 'plane-csv',
    transactionSourceKind: 'file',
});
