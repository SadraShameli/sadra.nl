import 'server-only';

import type { RawTransaction } from '~/lib/accounting/core/types';
import type { FileSource } from '~/lib/accounting/sources/source';

import { PlaneCsvParser } from '~/lib/accounting/providers/plane/csv-parser';
import { SourceRegistry } from '~/lib/accounting/sources/source';

class PlaneCsvSource implements FileSource {
    private readonly parser = new PlaneCsvParser();

    readonly acceptExtension = '.csv';

    readonly credentialKind = 'plane';

    readonly id = 'plane-csv';
    readonly kind = 'file' as const;
    readonly label = 'Plane.com payouts (CSV)';

    parse(content: string, meta: Record<string, unknown>): RawTransaction[] {
        return this.parser.parse(content, meta);
    }
}

export const planeCsvSource = new PlaneCsvSource();

{
    SourceRegistry.instance.register(planeCsvSource);
}
