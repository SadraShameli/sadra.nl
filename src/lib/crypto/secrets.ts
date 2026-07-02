import 'server-only';

import { env } from '~/env';

const ALGO = 'AES-GCM';
const KEY_BITS = 256;
const IV_BYTES = 12;
const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

let cachedKey: CryptoKey | null = null;

export async function openSecret(sealed: string): Promise<string> {
    const key = await deriveKey();
    const packed = fromBase64Url(sealed);
    if (packed.length <= IV_BYTES) {
        throw new Error('Sealed payload too short');
    }
    const iv = copyToFreshBuffer(packed.subarray(0, IV_BYTES));
    const ct = copyToFreshBuffer(packed.subarray(IV_BYTES));
    const pt = await crypto.subtle.decrypt({ iv, name: ALGO }, key, ct);
    return DECODER.decode(pt);
}

export async function sealSecret(plaintext: string): Promise<string> {
    const key = await deriveKey();
    const iv = crypto.getRandomValues(
        new Uint8Array(new ArrayBuffer(IV_BYTES)),
    );
    const plainBytes = copyToFreshBuffer(ENCODER.encode(plaintext));
    const ct = toUint8(
        await crypto.subtle.encrypt({ iv, name: ALGO }, key, plainBytes),
    );
    const packed = new Uint8Array(iv.length + ct.length);
    packed.set(iv, 0);
    packed.set(ct, iv.length);
    return toBase64Url(packed);
}

function copyToFreshBuffer(view: Uint8Array): Uint8Array<ArrayBuffer> {
    const fresh = new Uint8Array(new ArrayBuffer(view.byteLength));
    fresh.set(view);
    return fresh;
}

async function deriveKey(): Promise<CryptoKey> {
    if (cachedKey) return cachedKey;
    const ikm = copyToFreshBuffer(ENCODER.encode(env.AUTH_SECRET));
    const baseKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, [
        'deriveKey',
    ]);
    cachedKey = await crypto.subtle.deriveKey(
        {
            hash: 'SHA-256',
            info: copyToFreshBuffer(
                ENCODER.encode('sadranl/accounting-importer/credential-v1'),
            ),
            name: 'HKDF',
            salt: copyToFreshBuffer(ENCODER.encode('sadranl-importer')),
        },
        baseKey,
        { length: KEY_BITS, name: ALGO },
        false,
        ['encrypt', 'decrypt'],
    );
    return cachedKey;
}

function fromBase64Url(text: string): Uint8Array {
    const normalised = text.replaceAll('-', '+').replaceAll('_', '/');
    const buffer = Buffer.from(normalised, 'base64');
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function toBase64Url(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString('base64url');
}

function toUint8(buffer: ArrayBuffer): Uint8Array<ArrayBuffer> {
    return new Uint8Array(buffer);
}
