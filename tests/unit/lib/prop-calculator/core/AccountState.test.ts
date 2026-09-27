import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    accountStateSchema,
    createInitialState,
} from '~/lib/prop-calculator/core';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const CANONICAL_MODULE = path.join(
    'src',
    'lib',
    'prop-calculator',
    'core',
    'AccountState.ts',
);

describe('accountStateSchema: one schema for the funded/eval account state', () => {
    it('parses a freshly created state', () => {
        const state = createInitialState(50_000, 48_000);
        expect(accountStateSchema.parse(state)).toEqual(state);
    });

    it('rejects a state missing todayPnL', () => {
        const state: Partial<ReturnType<typeof createInitialState>> = {
            ...createInitialState(50_000, 48_000),
        };
        delete state.todayPnL;
        expect(() => accountStateSchema.parse(state)).toThrow();
    });

    it('rejects a wrong-typed consecutiveIdleDays', () => {
        const state = {
            ...createInitialState(50_000, 48_000),
            consecutiveIdleDays: '0',
        };
        expect(() => accountStateSchema.parse(state)).toThrow();
    });

    it('rejects a negative balance', () => {
        const state = { ...createInitialState(50_000, 48_000), balance: -1 };
        expect(() => accountStateSchema.parse(state)).toThrow();
    });

    it('leaves no second copy of the schema anywhere in src', () => {
        const copies = readdirSync(path.join(REPO_ROOT, 'src'), {
            recursive: true,
        })
            .map(String)
            .filter((file) => /\.tsx?$/.test(file))
            .map((file) => path.join('src', file))
            .filter((file) => file !== CANONICAL_MODULE)
            .filter((file) =>
                readFileSync(path.join(REPO_ROOT, file), 'utf8').includes(
                    'satisfies z.ZodType<AccountState>',
                ),
            );
        expect(copies).toStrictEqual([]);
    });
});
