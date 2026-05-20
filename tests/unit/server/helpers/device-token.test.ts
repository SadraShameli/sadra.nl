import { describe, expect, it } from 'vitest';

import {
    generateDeviceToken,
    hashDeviceToken,
    isDeviceTokenShape,
} from '~/server/helpers/device-token';

describe('DeviceToken', () => {
    it('generates a token with the expected prefix and length', async () => {
        const { hash, token } = await generateDeviceToken();
        expect(token.startsWith('shdev_')).toBe(true);
        expect(token.length).toBeGreaterThan(40);
        expect(hash).toHaveLength(64);
    });

    it('hashing the same token deterministically', async () => {
        const { hash, token } = await generateDeviceToken();
        const again = await hashDeviceToken(token);
        expect(again).toBe(hash);
    });

    it('different tokens hash to different values', async () => {
        const a = await generateDeviceToken();
        const b = await generateDeviceToken();
        expect(a.token).not.toBe(b.token);
        expect(a.hash).not.toBe(b.hash);
    });

    it('recognises a valid token shape', () => {
        expect(isDeviceTokenShape('shdev_abc')).toBe(true);
        expect(isDeviceTokenShape('shdev_')).toBe(false);
        expect(isDeviceTokenShape('Bearer foo')).toBe(false);
    });
});
