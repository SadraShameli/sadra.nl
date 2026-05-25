const TOKEN_PREFIX = 'shdev_';
const BYTES = 32;

export async function generateDeviceToken(): Promise<{
    hash: string;
    token: string;
}> {
    const random = new Uint8Array(BYTES);
    crypto.getRandomValues(random);
    const token = `${TOKEN_PREFIX}${bytesToBase64Url(random)}`;
    const hash = await hashDeviceToken(token);
    return { hash, token };
}

export async function hashDeviceToken(token: string): Promise<string> {
    const data = new TextEncoder().encode(token);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(digest));
}

export function isDeviceTokenShape(value: string): boolean {
    return value.startsWith(TOKEN_PREFIX) && value.length > TOKEN_PREFIX.length;
}

function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCodePoint(byte);
    return btoa(binary)
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replaceAll('=', '');
}

function bytesToHex(bytes: Uint8Array): string {
    let hex = '';
    for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
    return hex;
}
