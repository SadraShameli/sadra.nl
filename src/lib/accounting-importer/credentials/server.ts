import 'server-only';

import { getProvider } from '../providers/provider';
import { WiseClient } from '../wise/client';
import { getCredentialDescriptor, listCredentialDescriptors } from './registry';
import './eboekhouden';
import './wise';

export type CredentialTestFn = (opts: {
    fetchImpl?: typeof fetch;
    meta: Record<string, unknown>;
    secret: string;
}) => Promise<CredentialTestResult>;

export interface CredentialTestResult {
    detail: string;
    ok: boolean;
}

export interface FieldOption {
    description?: string;
    label: string;
    value: string;
}

export type FieldOptionsLoader = (opts: {
    fetchImpl?: typeof fetch;
    meta: Record<string, unknown>;
    secret: string;
}) => Promise<FieldOption[]>;

const tests = new Map<string, CredentialTestFn>();
const optionsLoaders = new Map<string, FieldOptionsLoader>();

const optionsKey = (credentialKind: string, fieldKey: string): string =>
    `${credentialKind}:${fieldKey}`;

export function getCredentialTest(id: string): CredentialTestFn | undefined {
    return tests.get(id);
}

export function getFieldOptionsLoader(
    credentialKind: string,
    fieldKey: string,
): FieldOptionsLoader | undefined {
    return optionsLoaders.get(optionsKey(credentialKind, fieldKey));
}

export function registerCredentialTest(id: string, fn: CredentialTestFn): void {
    tests.set(id, fn);
}

export function registerFieldOptionsLoader(
    credentialKind: string,
    fieldKey: string,
    loader: FieldOptionsLoader,
): void {
    optionsLoaders.set(optionsKey(credentialKind, fieldKey), loader);
}

async function defaultAccountingTest(
    credentialId: string,
    opts: {
        fetchImpl?: typeof fetch;
        meta: Record<string, unknown>;
        secret: string;
    },
): Promise<CredentialTestResult> {
    const descriptor = getCredentialDescriptor(credentialId);
    if (!descriptor?.accountingProviderId) {
        return { detail: 'No accounting provider registered', ok: false };
    }
    const provider = getProvider(descriptor.accountingProviderId);
    if (!provider) {
        return {
            detail: `Provider ${descriptor.accountingProviderId} not registered`,
            ok: false,
        };
    }
    const session = await provider.openSession({
        fetchImpl: opts.fetchImpl,
        meta: opts.meta,
        secret: opts.secret,
    });
    try {
        const ledgers = await session.listLedgers();
        return { detail: `${ledgers.length} ledger(s) reachable`, ok: true };
    } finally {
        await session.close().catch(swallow);
    }
}

registerCredentialTest('eboekhouden', (opts) =>
    defaultAccountingTest('eboekhouden', opts),
);

registerCredentialTest('wise', async (opts) => {
    const sandbox =
        typeof opts.meta.sandbox === 'boolean' ? opts.meta.sandbox : false;
    const client = new WiseClient(opts.secret, {
        fetch: opts.fetchImpl,
        sandbox,
    });
    const profiles = await client.profiles();
    return { detail: `${profiles.length} profile(s) reachable`, ok: true };
});

registerFieldOptionsLoader('wise', 'profileId', async (opts) => {
    const sandbox =
        typeof opts.meta.sandbox === 'boolean' ? opts.meta.sandbox : false;
    const client = new WiseClient(opts.secret, {
        fetch: opts.fetchImpl,
        sandbox,
    });
    const profiles = await client.profiles();
    return profiles.map((p) => ({
        description: p.type,
        label: `${p.type} · ${p.id}`,
        value: String(p.id),
    }));
});

export function knownCredentialIds(): string[] {
    return listCredentialDescriptors().map((d) => d.id);
}

function swallow(): void {
    return undefined;
}
