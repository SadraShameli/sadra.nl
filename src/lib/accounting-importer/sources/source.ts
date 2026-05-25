import type { RawTransaction } from '../core/types';

export interface ApiSource extends SourceDescriptor {
    readonly credentialKind: string;
    fetch(ctx: ApiSourceContext): Promise<RawTransaction[]>;
    readonly kind: 'api';
}

export interface ApiSourceContext {
    fetchImpl?: typeof fetch;
    from: string;
    meta: Record<string, unknown>;
    secret: string;
    to: string;
}

export interface CsvSource extends SourceDescriptor {
    readonly kind: 'csv';
    parse(text: string): RawTransaction[];
    supports(headers: readonly string[]): boolean;
}

export const SOURCE_KINDS = ['api', 'csv'] as const;
export interface SourceDescriptor {
    readonly id: string;
    readonly kind: SourceKind;
    readonly label: string;
}

export type SourceKind = (typeof SOURCE_KINDS)[number];

export type TransactionSource = ApiSource | CsvSource;

const registry = new Map<string, TransactionSource>();

export function detectCsvSource(headers: readonly string[]): CsvSource | null {
    for (const source of listCsvSources()) {
        if (source.supports(headers)) return source;
    }
    return null;
}

export function findApiSourceByCredentialKind(
    credentialKind: string,
): ApiSource | undefined {
    return listApiSources().find((s) => s.credentialKind === credentialKind);
}

export function getSource(id: string): TransactionSource | undefined {
    return registry.get(id);
}

export function listApiSources(): ApiSource[] {
    return [...registry.values()].filter(
        (s): s is ApiSource => s.kind === 'api',
    );
}

export function listCsvSources(): CsvSource[] {
    return [...registry.values()].filter(
        (s): s is CsvSource => s.kind === 'csv',
    );
}

export function listSources(): TransactionSource[] {
    return [...registry.values()];
}

export function registerSource(source: TransactionSource): void {
    registry.set(source.id, source);
}
