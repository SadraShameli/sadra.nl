import { describe, expect, it } from 'vitest';

import { type KeyValueStorage } from '~/app/(app)/prop-calculator/_components/browserStorage';
import {
    readLastToolQuery,
    writeLastToolQuery,
} from '~/app/(app)/prop-calculator/_components/lastToolQuery';

class MemoryStorage implements KeyValueStorage {
    readonly values = new Map<string, string>();

    getItem(key: string): null | string {
        return this.values.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.values.set(key, value);
    }
}

const throwingStorage: KeyValueStorage = {
    getItem() {
        throw new Error('SecurityError');
    },
    setItem() {
        throw new Error('QuotaExceededError');
    },
};

describe('lastToolQuery', () => {
    it('reads back what was written', () => {
        const storage = new MemoryStorage();
        writeLastToolQuery('firm=apex&wr=0.400', storage);
        expect(readLastToolQuery(storage)).toBe('firm=apex&wr=0.400');
        expect(storage.values.size).toBe(1);
    });

    it('overwrites the previous query', () => {
        const storage = new MemoryStorage();
        writeLastToolQuery('firm=apex', storage);
        writeLastToolQuery('firm=topstep', storage);
        expect(readLastToolQuery(storage)).toBe('firm=topstep');
    });

    it('returns null when nothing was written', () => {
        expect(readLastToolQuery(new MemoryStorage())).toBeNull();
    });

    it('returns null and never throws with a throwing storage', () => {
        expect(() =>
            writeLastToolQuery('firm=apex', throwingStorage),
        ).not.toThrow();
        expect(readLastToolQuery(throwingStorage)).toBeNull();
    });

    it('returns null without any storage', () => {
        expect(readLastToolQuery(null)).toBeNull();
        expect(() => writeLastToolQuery('firm=apex', null)).not.toThrow();
    });

    it('returns null in a non-browser environment by default', () => {
        expect(readLastToolQuery()).toBeNull();
        expect(() => writeLastToolQuery('firm=apex')).not.toThrow();
    });

    it('normalizes a stored query and drops a fragment or a leading question mark', () => {
        const storage = new MemoryStorage();
        writeLastToolQuery('?firm=apex&note=a b', storage);
        expect(readLastToolQuery(storage)).toBe('firm=apex&note=a+b');
        for (const key of storage.values.keys()) {
            storage.setItem(key, 'firm=x#evil');
        }
        expect(readLastToolQuery(storage)).toBe('firm=x%23evil');
    });

    it('returns null for an empty stored query', () => {
        const storage = new MemoryStorage();
        writeLastToolQuery('', storage);
        expect(readLastToolQuery(storage)).toBeNull();
    });
});
