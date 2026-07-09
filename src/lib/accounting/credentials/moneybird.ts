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
        administrationId: z.string().min(1),
    })
    .strict();

CredentialRegistry.instance().register({
    accountingProviderId: 'moneybird',
    id: CredentialKind.Moneybird,
    label: 'Moneybird',
    metaFields: [
        {
            key: 'administrationId',
            label: 'Administration',
            required: true,
            type: MetaFieldType.Select,
        },
    ],
    metaSchema,
    role: CredentialRole.Accounting,
    secret: {
        label: 'Personal access token',
        minLength: 16,
        placeholder: 'eyJxxx…',
    },
    tone: CredentialTone.Amber,
});
