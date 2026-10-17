const LOCAL_HOSTS: ReadonlySet<string> = new Set([
    '127.0.0.1',
    '::1',
    '[::1]',
    'localhost',
]);

const DRIVER_ONLY_PARAMETERS = ['sslmode', 'uselibpqcompat'] as const;

export interface VerifiedTls {
    readonly rejectUnauthorized: true;
}

export function databaseConnectionString(raw: string): string {
    const url = new URL(raw);
    for (const parameter of DRIVER_ONLY_PARAMETERS) {
        url.searchParams.delete(parameter);
    }
    return url.href;
}

export function databaseTls(raw: string): false | VerifiedTls {
    return requiresTls(raw) ? { rejectUnauthorized: true } : false;
}

function requiresTls(raw: string): boolean {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return true;
    }
    return (
        url.searchParams.get('sslmode') !== 'disable' &&
        !LOCAL_HOSTS.has(url.hostname)
    );
}
