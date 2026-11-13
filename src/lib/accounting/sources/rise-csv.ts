import 'server-only';

import type { RawTransaction } from '~/lib/accounting/core/types';
import type { FileSource } from '~/lib/accounting/sources/source';

import { CredentialKind } from '~/lib/accounting/credentials/registry';
import { RiseCsvParser } from '~/lib/accounting/providers/rise/csv-parser';
import { SourceRegistry } from '~/lib/accounting/sources/source';

class RiseCsvSource implements FileSource {
    private readonly parser = new RiseCsvParser();

    readonly acceptExtension = '.csv';

    readonly credentialKind = CredentialKind.Rise;

    readonly id = 'rise-csv';
    readonly kind = 'file' as const;
    readonly label = 'Rise payouts (CSV)';

    parse(content: string): RawTransaction[] {
        return this.parser.parse(content);
    }
}

export const riseCsvSource = new RiseCsvSource();

{
    SourceRegistry.instance.register(riseCsvSource);
}
