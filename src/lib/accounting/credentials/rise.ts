import { z } from 'zod';

import {
    CredentialKind,
    CredentialRegistry,
    CredentialRole,
} from '~/lib/accounting/credentials/registry';

const metaSchema = z.object({}).strict();

CredentialRegistry.instance.register({
    id: CredentialKind.Rise,
    label: 'Rise (CSV)',
    metaFields: [],
    metaSchema,
    requiresSecret: false,
    role: CredentialRole.Transactions,
    transactionSourceId: 'rise-csv',
    transactionSourceKind: 'file',
});
