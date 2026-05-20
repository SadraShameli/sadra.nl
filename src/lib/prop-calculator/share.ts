import { type SimInputsRaw, simInputsRawSchema } from './inputs-schema';

export function decodeShareState(encoded: string): null | {
    firmId: string;
    planId: string;
    raw: SimInputsRaw;
} {
    try {
        const padded = encoded.replaceAll('-', '+').replaceAll('_', '/');
        const binary = atob(padded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.codePointAt(i) ?? 0;
        }
        const json = new TextDecoder().decode(bytes);
        const parsed = JSON.parse(json) as unknown;
        if (
            !parsed ||
            typeof parsed !== 'object' ||
            !('firmId' in parsed) ||
            !('planId' in parsed) ||
            !('raw' in parsed)
        ) {
            return null;
        }
        const shape = parsed;
        if (
            typeof shape.firmId !== 'string' ||
            typeof shape.planId !== 'string'
        ) {
            return null;
        }
        const raw = simInputsRawSchema.safeParse(shape.raw);
        if (!raw.success) return null;
        return { firmId: shape.firmId, planId: shape.planId, raw: raw.data };
    } catch {
        return null;
    }
}

export function encodeShareState(input: {
    firmId: string;
    planId: string;
    raw: SimInputsRaw;
}): string {
    const json = JSON.stringify(input);
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    for (const byte of bytes) binary += String.fromCodePoint(byte);
    return btoa(binary)
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replaceAll('=', '');
}
