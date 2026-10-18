import {
    CredentialRegistry,
    CredentialRole,
} from '~/lib/accounting/credentials/index';

const ROLE_LABEL: Readonly<Record<CredentialRole, string>> = {
    [CredentialRole.Accounting]: 'Accounting',
    [CredentialRole.Transactions]: 'Source',
};

const ROLE_NOUN: Readonly<Record<CredentialRole, string>> = {
    [CredentialRole.Accounting]: 'accounting credential',
    [CredentialRole.Transactions]: 'transaction source',
};

export function ActiveConnectionNote({
    credential,
    role,
}: {
    credential: undefined | { kind: string; label: string };
    role: CredentialRole;
}) {
    const descriptor = credential
        ? CredentialRegistry.instance.get(credential.kind)
        : undefined;
    return credential ? (
        <span className="whitespace-nowrap">
            {ROLE_LABEL[role]}: {descriptor?.label ?? credential.kind} ·{' '}
            {credential.label}
        </span>
    ) : (
        <span>No {ROLE_NOUN[role]} set.</span>
    );
}
