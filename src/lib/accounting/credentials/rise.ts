import { z } from 'zod';

import {
    CredentialKind,
    CredentialRegistry,
    CredentialRole,
} from '~/lib/accounting/credentials/registry';

const metaSchema = z.object({}).strict();

CredentialRegistry.instance.register({
    description:
        'Books payouts when they are paid into your Rise balance. Do not also import the same money as incoming Wise transfers, or it is booked twice.',
    id: CredentialKind.Rise,
    label: 'Rise (CSV)',
    metaFields: [],
    metaSchema,
    requiresSecret: false,
    role: CredentialRole.Transactions,
    transactionSourceId: 'rise-csv',
    transactionSourceKind: 'file',
});
