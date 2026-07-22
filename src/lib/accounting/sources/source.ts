import type { RawTransaction } from '~/lib/accounting/core/types';

import { RetryPolicy } from '~/lib/accounting/core/retry-policy';

export interface ApiSource {
    readonly credentialKind: string;
    fetch(context: ApiSourceContext): Promise<RawTransaction[]>;
    readonly id: string;
    readonly kind: 'api';
    readonly label: string;
}

export interface ApiSourceContext {
    fetchImpl?: typeof fetch;
    from: string;
    meta: Record<string, unknown>;
    secret: string;
    to: string;
}

export interface FileSource {
    readonly acceptExtension: string;
    readonly credentialKind: string;
    readonly id: string;
    readonly kind: 'file';
    readonly label: string;
    parse(content: string, meta: Record<string, unknown>): RawTransaction[];
}

export type Source = ApiSource | FileSource;

export abstract class ApiSourceBase implements ApiSource {
    abstract readonly credentialKind: string;
    abstract readonly id: string;
    readonly kind = 'api' as const;
    abstract readonly label: string;

    protected readonly retryPolicy: RetryPolicy = RetryPolicy.default;

    async fetch(context: ApiSourceContext): Promise<RawTransaction[]> {
        return this.retryPolicy.execute(() => this.fetchRaw(context));
    }

    protected abstract fetchRaw(
        context: ApiSourceContext,
    ): Promise<RawTransaction[]>;
}

export class SourceRegistry {
    private static instanceValue: null | SourceRegistry = null;

    static get instance(): SourceRegistry {
        this.instanceValue ??= new SourceRegistry();
        return this.instanceValue;
    }

    private readonly sources: Map<string, Source>;

    private constructor() {
        this.sources = new Map<string, Source>();
    }

    findByCredentialKind(credentialKind: string): Source | undefined {
        return this.sources
            .values()
            .find((s) => s.credentialKind === credentialKind);
    }

    get(id: string): Source | undefined {
        return this.sources.get(id);
    }

    list(): Source[] {
        return this.sources.values().toArray();
    }

    register(s: Source): void {
        this.sources.set(s.id, s);
    }
}
