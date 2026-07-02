export type Brand<T, B extends string> = T & { readonly __brand: B };

export type CredentialId = Brand<string, 'CredentialId'>;

export type RunId = Brand<string, 'RunId'>;

export type TxnId = Brand<string, 'TxnId'>;

export type UserId = Brand<string, 'UserId'>;

export function CredentialId(value: string): CredentialId {
    return value as CredentialId;
}

export function RunId(value: string): RunId {
    return value as RunId;
}

export function TxnId(value: string): TxnId {
    return value as TxnId;
}

export function UserId(value: string): UserId {
    return value as UserId;
}
