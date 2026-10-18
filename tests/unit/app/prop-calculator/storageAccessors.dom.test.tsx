import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readLastToolQuery } from '~/app/(app)/prop-calculator/_components/lastToolQuery';
import {
    isScenarioImportDone,
    markScenarioImportDone,
} from '~/app/(app)/prop-calculator/_components/savedScenarioSync';

class MemoryStorage {
    readonly values = new Map<string, string>();

    getItem(key: string): null | string {
        return this.values.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.values.set(key, value);
    }
}

const stores = vi.hoisted(() => ({
    local: null as MemoryStorage | null,
    session: null as MemoryStorage | null,
}));

vi.mock('~/app/(app)/prop-calculator/_components/browserStorage', () => ({
    localStorageOrNull: () => stores.local,
    sessionStorageOrNull: () => stores.session,
}));

describe('storage helpers read through the shared browser storage accessors', () => {
    beforeEach(() => {
        stores.local = new MemoryStorage();
        stores.session = new MemoryStorage();
        window.localStorage.clear();
        window.sessionStorage.clear();
    });

    it('reads the last tool query from the shared session storage accessor', () => {
        stores.session?.setItem('propCalc.lastToolQuery.v1', 'firm=apex');
        expect(readLastToolQuery()).toBe('firm=apex');
        expect(window.sessionStorage.length).toBe(0);
    });

    it('keeps the scenario import flag in the shared local storage accessor', () => {
        markScenarioImportDone('user-1');
        expect(window.localStorage.length).toBe(0);
        expect(isScenarioImportDone('user-1')).toBe(true);
        expect(stores.local?.values.size).toBe(1);
    });

    it('treats a missing storage as not imported and never throws', () => {
        stores.local = null;
        expect(() => {
            markScenarioImportDone('user-1');
        }).not.toThrow();
        expect(isScenarioImportDone('user-1')).toBe(false);
    });
});
