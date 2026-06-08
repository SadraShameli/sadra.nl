import type { RawTransaction } from '../core/types';

export interface ApiSource {
    readonly credentialKind: string;
    fetch(ctx: ApiSourceContext): Promise<RawTransaction[]>;
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

const registry = new Map<string, ApiSource>();

export function findApiSourceByCredentialKind(
    credentialKind: string,
): ApiSource | undefined {
    return [...registry.values()].find(
        (s) => s.credentialKind === credentialKind,
    );
}

export function getSource(id: string): ApiSource | undefined {
    return registry.get(id);
}

export function registerSource(source: ApiSource): void {
    registry.set(source.id, source);
}
