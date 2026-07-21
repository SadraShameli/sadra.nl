import 'server-only';

import { CredentialRegistry } from '~/lib/accounting/credentials/registry';
import { listMoneybirdAdministrations } from '~/lib/accounting/providers/moneybird/client';
import { ProviderRegistry } from '~/lib/accounting/providers/provider';
import { WiseClient } from '~/lib/accounting/wise/client';
import '~/lib/accounting/credentials/eboekhouden';
import '~/lib/accounting/credentials/moneybird';
import '~/lib/accounting/credentials/wise';

export type CredentialTestFunction = (options: {
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

export type FieldOptionsLoader = (options: {
    fetchImpl?: typeof fetch;
    meta: Record<string, unknown>;
    secret: string;
}) => Promise<FieldOption[]>;

const tests = new Map<string, CredentialTestFunction>();
const optionsLoaders = new Map<string, FieldOptionsLoader>();

const optionsKey = (credentialKind: string, fieldKey: string): string =>
    `${credentialKind}:${fieldKey}`;

export function getCredentialTest(
    id: string,
): CredentialTestFunction | undefined {
    return tests.get(id);
}

export function getFieldOptionsLoader(
    credentialKind: string,
    fieldKey: string,
): FieldOptionsLoader | undefined {
    return optionsLoaders.get(optionsKey(credentialKind, fieldKey));
}

export function registerCredentialTest(
    id: string,
    function_: CredentialTestFunction,
): void {
    tests.set(id, function_);
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
    options: {
        fetchImpl?: typeof fetch;
        meta: Record<string, unknown>;
        secret: string;
    },
): Promise<CredentialTestResult> {
    const descriptor = CredentialRegistry.instance().get(credentialId);
    if (!descriptor?.accountingProviderId) {
        return { detail: 'No accounting provider registered', ok: false };
    }
    const provider = ProviderRegistry.instance().get(
        descriptor.accountingProviderId,
    );
    if (!provider) {
        return {
            detail: `Provider ${descriptor.accountingProviderId} not registered`,
            ok: false,
        };
    }
    const session = await provider.openSession({
        meta: options.meta,
        secret: options.secret,
    });
    try {
        const ledgers = await session.listLedgers();
        return { detail: `${ledgers.length} ledger(s) reachable`, ok: true };
    } finally {
        try {
            await session.close();
        } catch {}
    }
}

{
    registerCredentialTest('eboekhouden', (options) =>
        defaultAccountingTest('eboekhouden', options),
    );

    registerCredentialTest('moneybird', (options) =>
        defaultAccountingTest('moneybird', options),
    );

    registerFieldOptionsLoader(
        'moneybird',
        'administrationId',
        async (options) => {
            const administrations = await listMoneybirdAdministrations(
                options.secret,
            );
            return administrations.map((administration) => ({
                label: `${administration.name} (${administration.currency})`,
                value: administration.id,
            }));
        },
    );

    registerCredentialTest('wise', async (options) => {
        const isSandbox =
            typeof options.meta.sandbox === 'boolean'
                ? options.meta.sandbox
                : false;
        const client = new WiseClient(options.secret, {
            fetch: options.fetchImpl,
            sandbox: isSandbox,
        });
        const profiles = await client.profiles();
        return { detail: `${profiles.length} profile(s) reachable`, ok: true };
    });

    registerFieldOptionsLoader('wise', 'profileId', async (options) => {
        const isSandbox =
            typeof options.meta.sandbox === 'boolean'
                ? options.meta.sandbox
                : false;
        const client = new WiseClient(options.secret, {
            fetch: options.fetchImpl,
            sandbox: isSandbox,
        });
        const profiles = await client.profiles();
        return profiles.map((p) => ({
            description: p.type,
            label: `${p.type} · ${p.id}`,
            value: String(p.id),
        }));
    });
}

export function knownCredentialIds(): string[] {
    return CredentialRegistry.instance()
        .list()
        .map((d) => d.id);
}
