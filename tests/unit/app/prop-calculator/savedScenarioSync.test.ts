import { describe, expect, it, vi } from 'vitest';

import {
    accountScenarioRecords,
    clearAccountScenarios,
    errorMessage,
    type FlagStorage,
    importLocalScenarios,
    isScenarioImportDone,
    markScenarioImportDone,
    planScenarioImport,
    type ScenarioImport,
    scenarioImportNotice,
    type ScenarioImportResult,
    ScenarioImportRuns,
    ScenarioImportStatus,
    scenarioRemovalNotice,
    ScenarioSkipReason,
    ScenarioStore,
    scenarioStoreFor,
    type StoredScenario,
    validateAccountScenario,
} from '~/app/(app)/prop-calculator/_components/savedScenarioSync';
import { type SavedScenarioRecord } from '~/app/(app)/prop-calculator/_components/urlState';
import {
    PropLimitRejection,
    PropQuota,
    type PropRejection,
} from '~/lib/schemas/propAccountOutputs';
import {
    MAX_SCENARIO_NAME_LENGTH,
    MAX_SCENARIO_QUERY_LENGTH,
} from '~/lib/schemas/propAccounts';

const LOCAL_SCENARIOS_KEY = 'propCalc.scenarios.v1';

class MemoryStorage implements FlagStorage {
    readonly values = new Map<string, string>();

    getItem(key: string): null | string {
        return this.values.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.values.set(key, value);
    }
}

const throwingStorage: FlagStorage = {
    getItem() {
        throw new Error('SecurityError');
    },
    setItem() {
        throw new Error('QuotaExceededError');
    },
};

function importAll() {
    return vi.fn((scenarios: ScenarioImport[]) =>
        Promise.resolve({ imported: scenarios, skippedNames: [] }),
    );
}

function local(name: string, params: string, savedAt = 1): SavedScenarioRecord {
    return { name, params, savedAt };
}

function quotaRejection(quota: PropQuota, limit = 100): PropRejection {
    return {
        lifecycleRejection: null,
        limit,
        quota,
        reason: PropLimitRejection.QuotaExceeded,
        record: null,
        recordId: null,
    };
}

function storageWithLocalScenarios(records: SavedScenarioRecord[]) {
    const storage = new MemoryStorage();
    storage.setItem(LOCAL_SCENARIOS_KEY, JSON.stringify(records));
    return storage;
}

function stored(
    name: string,
    query: string,
    updatedAt = new Date('2026-09-01T00:00:00Z'),
    userId = 'user-1',
): StoredScenario {
    return { id: `id-${name}`, name, query, updatedAt, userId };
}

function trpcError(
    message: string,
    data: { code: string; propRejection?: PropRejection },
): Error {
    return Object.assign(new Error(message), { data });
}

describe('planScenarioImport', () => {
    it('imports every local scenario the server does not have', () => {
        const plan = planScenarioImport(
            [local('Apex 50k', 'firm=apex'), local('Topstep', 'firm=topstep')],
            [stored('Other', 'firm=mff')],
        );
        expect(plan.imports).toEqual([
            { name: 'Apex 50k', query: 'firm=apex' },
            { name: 'Topstep', query: 'firm=topstep' },
        ]);
        expect(plan.skipped).toEqual([]);
    });

    it('skips a local scenario already on the server with the same name and query', () => {
        const plan = planScenarioImport(
            [local('Apex 50k', 'firm=apex')],
            [stored('Apex 50k', 'firm=apex')],
        );
        expect(plan.imports).toEqual([]);
        expect(plan.skipped).toEqual([]);
    });

    it('treats a name that only differs by outer spaces as the same scenario', () => {
        const plan = planScenarioImport(
            [local('  Apex 50k ', 'firm=apex')],
            [stored('Apex 50k', 'firm=apex')],
        );
        expect(plan.imports).toEqual([]);
    });

    it('suffixes a local scenario whose name is taken on the server by a different query', () => {
        const plan = planScenarioImport(
            [local('Apex 50k', 'firm=apex&wr=0.5')],
            [stored('Apex 50k', 'firm=apex&wr=0.4')],
        );
        expect(plan.imports).toEqual([
            { name: 'Apex 50k (2)', query: 'firm=apex&wr=0.5' },
        ]);
    });

    it('picks the next free suffix when earlier suffixes are taken', () => {
        const plan = planScenarioImport(
            [local('Apex', 'firm=apex&wr=0.6')],
            [
                stored('Apex', 'firm=apex&wr=0.4'),
                stored('Apex (2)', 'firm=apex&wr=0.5'),
            ],
        );
        expect(plan.imports).toEqual([
            { name: 'Apex (3)', query: 'firm=apex&wr=0.6' },
        ]);
    });

    it('does not import a scenario again when a previous import stored it under a suffix', () => {
        const plan = planScenarioImport(
            [local('Apex', 'firm=apex&wr=0.5')],
            [
                stored('Apex', 'firm=apex&wr=0.4'),
                stored('Apex (2)', 'firm=apex&wr=0.5'),
            ],
        );
        expect(plan.imports).toEqual([]);
    });

    it('suffixes local scenarios that collide with each other', () => {
        const plan = planScenarioImport(
            [
                local('Apex', 'firm=apex&wr=0.4'),
                local('Apex', 'firm=apex&wr=0.5'),
            ],
            [],
        );
        expect(plan.imports).toEqual([
            { name: 'Apex', query: 'firm=apex&wr=0.4' },
            { name: 'Apex (2)', query: 'firm=apex&wr=0.5' },
        ]);
    });

    it('imports a local duplicate with the same name and query only once', () => {
        const plan = planScenarioImport(
            [local('Apex', 'firm=apex'), local('Apex', 'firm=apex')],
            [],
        );
        expect(plan.imports).toEqual([{ name: 'Apex', query: 'firm=apex' }]);
    });

    it('imports a query of exactly 8,192 characters', () => {
        const query = `q=${'a'.repeat(MAX_SCENARIO_QUERY_LENGTH - 2)}`;
        expect(query).toHaveLength(8192);
        const plan = planScenarioImport([local('Big', query)], []);
        expect(plan.imports).toEqual([{ name: 'Big', query }]);
        expect(plan.skipped).toEqual([]);
    });

    it('skips a scenario over 8,192 characters with a notice reason', () => {
        const query = `q=${'a'.repeat(MAX_SCENARIO_QUERY_LENGTH - 1)}`;
        expect(query).toHaveLength(8193);
        const plan = planScenarioImport(
            [local('Too big', query), local('Fine', 'firm=apex')],
            [],
        );
        expect(plan.imports).toEqual([{ name: 'Fine', query: 'firm=apex' }]);
        expect(plan.skipped).toEqual([
            { name: 'Too big', reason: ScenarioSkipReason.QueryTooLong },
        ]);
    });

    it('shortens a name over 64 characters so it fits the server column', () => {
        const long = 'x'.repeat(MAX_SCENARIO_NAME_LENGTH + 10);
        const plan = planScenarioImport([local(long, 'firm=apex')], []);
        expect(plan.imports).toEqual([
            { name: 'x'.repeat(MAX_SCENARIO_NAME_LENGTH), query: 'firm=apex' },
        ]);
    });

    it('keeps a suffixed long name within 64 characters', () => {
        const long = 'x'.repeat(MAX_SCENARIO_NAME_LENGTH + 10);
        const plan = planScenarioImport(
            [local(long, 'firm=apex&wr=0.5')],
            [stored('x'.repeat(MAX_SCENARIO_NAME_LENGTH), 'firm=apex&wr=0.4')],
        );
        const [imported] = plan.imports;
        expect(imported?.name).toBe(
            `${'x'.repeat(MAX_SCENARIO_NAME_LENGTH - 4)} (2)`,
        );
        expect(imported?.name).toHaveLength(MAX_SCENARIO_NAME_LENGTH);
    });

    it('never splits an emoji when shortening a name', () => {
        const long = `${'x'.repeat(MAX_SCENARIO_NAME_LENGTH - 1)}\u{1F680}tail`;
        const plan = planScenarioImport([local(long, 'firm=apex')], []);
        const [imported] = plan.imports;
        expect(imported?.name).toBe('x'.repeat(MAX_SCENARIO_NAME_LENGTH - 1));
    });

    it('skips a name the server would reject', () => {
        const plan = planScenarioImport(
            [
                local('Apex‮evil', 'firm=apex'),
                local(' '.repeat(3), 'firm=apex'),
            ],
            [],
        );
        expect(plan.imports).toEqual([]);
        expect(plan.skipped).toEqual([
            { name: 'Apex‮evil', reason: ScenarioSkipReason.InvalidName },
            { name: ' '.repeat(3), reason: ScenarioSkipReason.InvalidName },
        ]);
    });

    it('skips a query with control characters', () => {
        const plan = planScenarioImport([local('Apex', 'firm=apex\u{0}')], []);
        expect(plan.imports).toEqual([]);
        expect(plan.skipped).toEqual([
            { name: 'Apex', reason: ScenarioSkipReason.InvalidQuery },
        ]);
    });

    it('returns an empty plan for no local scenarios', () => {
        expect(planScenarioImport([], [stored('Apex', 'firm=apex')])).toEqual({
            imports: [],
            skipped: [],
        });
    });
});

describe('importLocalScenarios', () => {
    const records = [
        local('Apex', 'firm=apex', 2),
        local('Topstep', 'firm=topstep', 1),
    ];

    it('leaves local storage untouched and imports nothing when anonymous', async () => {
        const storage = storageWithLocalScenarios(records);
        const before = new Map(storage.values);
        const importMany = importAll();
        const outcome = await importLocalScenarios({
            importMany,
            local: records,
            server: [],
            storage,
            userId: null,
        });
        expect(outcome).toEqual({ status: ScenarioImportStatus.Anonymous });
        expect(importMany).not.toHaveBeenCalled();
        expect(storage.values).toEqual(before);
    });

    it('imports every scenario in one call, once, sets the flag and keeps the local scenarios', async () => {
        const storage = storageWithLocalScenarios(records);
        const localValue = storage.getItem(LOCAL_SCENARIOS_KEY);
        const importMany = importAll();
        const outcome = await importLocalScenarios({
            importMany,
            local: records,
            server: [],
            storage,
            userId: 'user-1',
        });
        expect(outcome).toEqual({
            imported: 2,
            skipped: [],
            status: ScenarioImportStatus.Imported,
        });
        expect(importMany.mock.calls).toEqual([
            [
                [
                    { name: 'Apex', query: 'firm=apex' },
                    { name: 'Topstep', query: 'firm=topstep' },
                ],
            ],
        ]);
        expect(isScenarioImportDone('user-1', storage)).toBe(true);
        expect(storage.getItem(LOCAL_SCENARIOS_KEY)).toBe(localValue);

        const again = await importLocalScenarios({
            importMany,
            local: records,
            server: [],
            storage,
            userId: 'user-1',
        });
        expect(again).toEqual({ status: ScenarioImportStatus.AlreadyImported });
        expect(importMany).toHaveBeenCalledTimes(1);
    });

    it('imports again for a different user on the same device', async () => {
        const storage = new MemoryStorage();
        markScenarioImportDone('user-1', storage);
        const importMany = importAll();
        const outcome = await importLocalScenarios({
            importMany,
            local: records,
            server: [],
            storage,
            userId: 'user-2',
        });
        expect(outcome.status).toBe(ScenarioImportStatus.Imported);
        expect(importMany).toHaveBeenCalledTimes(1);
        expect(isScenarioImportDone('user-2', storage)).toBe(true);
    });

    it('sets the flag without calling the server when nothing needs importing', async () => {
        const storage = new MemoryStorage();
        const importMany = importAll();
        const outcome = await importLocalScenarios({
            importMany,
            local: [],
            server: [],
            storage,
            userId: 'user-1',
        });
        expect(outcome).toEqual({
            imported: 0,
            skipped: [],
            status: ScenarioImportStatus.Imported,
        });
        expect(importMany).not.toHaveBeenCalled();
        expect(isScenarioImportDone('user-1', storage)).toBe(true);
    });

    it('reports skipped scenarios and still sets the flag', async () => {
        const storage = new MemoryStorage();
        const tooLong = `q=${'a'.repeat(MAX_SCENARIO_QUERY_LENGTH)}`;
        const importMany = importAll();
        const outcome = await importLocalScenarios({
            importMany,
            local: [local('Huge', tooLong), local('Apex', 'firm=apex')],
            server: [],
            storage,
            userId: 'user-1',
        });
        expect(outcome).toEqual({
            imported: 1,
            skipped: [
                { name: 'Huge', reason: ScenarioSkipReason.QueryTooLong },
            ],
            status: ScenarioImportStatus.Imported,
        });
        expect(isScenarioImportDone('user-1', storage)).toBe(true);
    });

    it('keeps a scenario the server skipped because another device saved its name first', async () => {
        const storage = new MemoryStorage();
        const importMany = vi.fn((scenarios: ScenarioImport[]) =>
            Promise.resolve({
                imported: scenarios.filter(({ name }) => name !== 'Topstep'),
                skippedNames: ['Topstep'],
            }),
        );
        const outcome = await importLocalScenarios({
            importMany,
            local: records,
            server: [],
            storage,
            userId: 'user-1',
        });
        expect(outcome).toEqual({
            imported: 1,
            skipped: [
                { name: 'Topstep', reason: ScenarioSkipReason.NameTaken },
            ],
            status: ScenarioImportStatus.Imported,
        });
        expect(isScenarioImportDone('user-1', storage)).toBe(true);
        expect(scenarioImportNotice(outcome)).toContain(
            'Topstep (name already saved to your account)',
        );
    });

    it('imports nothing and leaves the flag unset so it retries when the call fails', async () => {
        const storage = new MemoryStorage();
        const importMany = vi
            .fn<
                (scenarios: ScenarioImport[]) => Promise<ScenarioImportResult>
            >()
            .mockRejectedValueOnce(new Error('Too many requests'));
        const outcome = await importLocalScenarios({
            importMany,
            local: [...records, local('Lucid', 'firm=lucid')],
            server: [],
            storage,
            userId: 'user-1',
        });
        expect(outcome).toEqual({
            error: 'Too many requests',
            imported: 0,
            skipped: [],
            status: ScenarioImportStatus.Failed,
        });
        expect(importMany).toHaveBeenCalledTimes(1);
        expect(isScenarioImportDone('user-1', storage)).toBe(false);
    });

    it('fills the room left under the saved scenario quota and keeps the rest in this browser', async () => {
        const storage = new MemoryStorage();
        const quotaError = trpcError('You can keep at most 2 saved scenarios', {
            code: 'TOO_MANY_REQUESTS',
            propRejection: quotaRejection(PropQuota.Scenarios, 2),
        });
        const importMany = vi
            .fn<
                (scenarios: ScenarioImport[]) => Promise<ScenarioImportResult>
            >()
            .mockRejectedValueOnce(quotaError)
            .mockImplementation((scenarios) =>
                Promise.resolve({ imported: scenarios, skippedNames: [] }),
            );
        const tooLong = `q=${'a'.repeat(MAX_SCENARIO_QUERY_LENGTH)}`;
        const outcome = await importLocalScenarios({
            importMany,
            local: [
                local('Huge', tooLong),
                ...records,
                local('Lucid', 'firm=lucid'),
            ],
            server: [stored('Kept', 'firm=kept')],
            storage,
            userId: 'user-1',
        });
        expect(outcome).toEqual({
            imported: 1,
            skipped: [
                { name: 'Huge', reason: ScenarioSkipReason.QueryTooLong },
                { name: 'Topstep', reason: ScenarioSkipReason.AccountLimit },
                { name: 'Lucid', reason: ScenarioSkipReason.AccountLimit },
            ],
            status: ScenarioImportStatus.Imported,
        });
        expect(importMany.mock.calls.map(([batch]) => batch.length)).toEqual([
            3, 1,
        ]);
        expect(importMany.mock.calls[1]?.[0]).toEqual([
            { name: 'Apex', query: 'firm=apex' },
        ]);
        expect(isScenarioImportDone('user-1', storage)).toBe(true);
        const notice = scenarioImportNotice(outcome);
        expect(notice).toContain('Topstep (account limit reached)');
        expect(notice).toContain('kept in this browser');
        expect(notice).not.toContain('retry');
    });

    it('keeps every scenario in this browser when the account has no room left', async () => {
        const storage = new MemoryStorage();
        const importMany = vi
            .fn<
                (scenarios: ScenarioImport[]) => Promise<ScenarioImportResult>
            >()
            .mockRejectedValue(
                trpcError('You can keep at most 1 saved scenario', {
                    code: 'TOO_MANY_REQUESTS',
                    propRejection: quotaRejection(PropQuota.Scenarios, 1),
                }),
            );
        const outcome = await importLocalScenarios({
            importMany,
            local: records,
            server: [stored('Kept', 'firm=kept')],
            storage,
            userId: 'user-1',
        });
        expect(outcome).toEqual({
            imported: 0,
            skipped: [
                { name: 'Apex', reason: ScenarioSkipReason.AccountLimit },
                { name: 'Topstep', reason: ScenarioSkipReason.AccountLimit },
            ],
            status: ScenarioImportStatus.Imported,
        });
        expect(importMany).toHaveBeenCalledTimes(1);
        expect(isScenarioImportDone('user-1', storage)).toBe(true);
    });

    it('keeps retrying after a rate limit that is not a quota rejection', async () => {
        const storage = new MemoryStorage();
        const importMany = vi
            .fn<
                (scenarios: ScenarioImport[]) => Promise<ScenarioImportResult>
            >()
            .mockRejectedValue(
                trpcError('Too many requests', { code: 'TOO_MANY_REQUESTS' }),
            );
        const outcome = await importLocalScenarios({
            importMany,
            local: records,
            server: [],
            storage,
            userId: 'user-1',
        });
        expect(outcome.status).toBe(ScenarioImportStatus.Failed);
        expect(isScenarioImportDone('user-1', storage)).toBe(false);
    });

    it('keeps retrying after a quota rejection for a different record kind', async () => {
        const storage = new MemoryStorage();
        const importMany = vi
            .fn<
                (scenarios: ScenarioImport[]) => Promise<ScenarioImportResult>
            >()
            .mockRejectedValue(
                trpcError('You can keep at most 50 accounts', {
                    code: 'TOO_MANY_REQUESTS',
                    propRejection: quotaRejection(PropQuota.Accounts, 50),
                }),
            );
        const outcome = await importLocalScenarios({
            importMany,
            local: records,
            server: [],
            storage,
            userId: 'user-1',
        });
        expect(outcome.status).toBe(ScenarioImportStatus.Failed);
        expect(isScenarioImportDone('user-1', storage)).toBe(false);
    });

    it('never throws with a throwing storage', async () => {
        const outcome = await importLocalScenarios({
            importMany: importAll(),
            local: records,
            server: [],
            storage: throwingStorage,
            userId: 'user-1',
        });
        expect(outcome.status).toBe(ScenarioImportStatus.Imported);
        expect(isScenarioImportDone('user-1', throwingStorage)).toBe(false);
    });

    it('skips the flag without storage and still imports', async () => {
        const outcome = await importLocalScenarios({
            importMany: importAll(),
            local: records,
            server: [],
            storage: null,
            userId: 'user-1',
        });
        expect(outcome.status).toBe(ScenarioImportStatus.Imported);
        expect(isScenarioImportDone('user-1', null)).toBe(false);
    });
});

describe('scenarioImportNotice', () => {
    it('is silent when nothing happened', () => {
        expect(
            scenarioImportNotice({ status: ScenarioImportStatus.Anonymous }),
        ).toBeNull();
        expect(
            scenarioImportNotice({
                status: ScenarioImportStatus.AlreadyImported,
            }),
        ).toBeNull();
        expect(
            scenarioImportNotice({
                imported: 0,
                skipped: [],
                status: ScenarioImportStatus.Imported,
            }),
        ).toBeNull();
    });

    it('counts imported scenarios', () => {
        expect(
            scenarioImportNotice({
                imported: 1,
                skipped: [],
                status: ScenarioImportStatus.Imported,
            }),
        ).toBe('Imported 1 saved scenario from this browser to your account.');
        expect(
            scenarioImportNotice({
                imported: 3,
                skipped: [],
                status: ScenarioImportStatus.Imported,
            }),
        ).toBe('Imported 3 saved scenarios from this browser to your account.');
    });

    it('names a scenario skipped for being over 8,192 characters', () => {
        const notice = scenarioImportNotice({
            imported: 0,
            skipped: [
                { name: 'Huge', reason: ScenarioSkipReason.QueryTooLong },
            ],
            status: ScenarioImportStatus.Imported,
        });
        expect(notice).toContain('Huge');
        expect(notice).toContain('over 8,192 characters');
        expect(notice).toContain('kept in this browser');
    });

    it('explains invalid names and queries', () => {
        const notice = scenarioImportNotice({
            imported: 2,
            skipped: [
                { name: 'Bad', reason: ScenarioSkipReason.InvalidName },
                { name: 'Odd', reason: ScenarioSkipReason.InvalidQuery },
            ],
            status: ScenarioImportStatus.Imported,
        });
        expect(notice).toContain('Imported 2 saved scenarios');
        expect(notice).toContain('Bad (invalid name)');
        expect(notice).toContain('Odd (invalid link)');
    });

    it('reports a failure and says the import will retry', () => {
        const notice = scenarioImportNotice({
            error: 'Too many requests',
            imported: 1,
            skipped: [],
            status: ScenarioImportStatus.Failed,
        });
        expect(notice).toContain('Too many requests');
        expect(notice).toContain('retry');
        expect(notice).not.toContain(String.fromCodePoint(0x20_14));
    });
});

describe('scenarioStoreFor', () => {
    it('keeps anonymous users on local storage', () => {
        expect(scenarioStoreFor({ isPending: false, userId: null })).toBe(
            ScenarioStore.Local,
        );
    });

    it('uses the account for a signed-in user', () => {
        expect(scenarioStoreFor({ isPending: false, userId: 'user-1' })).toBe(
            ScenarioStore.Account,
        );
    });

    it('waits while the session is loading', () => {
        expect(scenarioStoreFor({ isPending: true, userId: null })).toBe(
            ScenarioStore.Pending,
        );
    });

    it('does not fall back to local storage when the session check failed', () => {
        expect(
            scenarioStoreFor({
                hasError: true,
                isPending: false,
                userId: null,
            }),
        ).toBe(ScenarioStore.Unavailable);
    });

    it('keeps a known user on the account when a session refetch failed', () => {
        expect(
            scenarioStoreFor({
                hasError: true,
                isPending: false,
                userId: 'user-1',
            }),
        ).toBe(ScenarioStore.Account);
    });
});

describe('ScenarioImportRuns', () => {
    it('runs one import per user at a time and reports it until it settles', async () => {
        const runs = new ScenarioImportRuns();
        const listener = vi.fn();
        const unsubscribe = runs.subscribe(listener);
        const gate = Promise.withResolvers<undefined>();
        const first = vi.fn(() => gate.promise);
        const second = vi.fn(() => Promise.resolve());

        const running = runs.run('user-1', first);
        expect(running).not.toBeNull();
        expect(runs.isRunning('user-1')).toBe(true);
        expect(runs.isRunning('user-2')).toBe(false);
        expect(runs.run('user-1', second)).toBeNull();
        expect(second).not.toHaveBeenCalled();
        expect(listener).toHaveBeenCalledTimes(1);

        gate.resolve(undefined);
        await running;
        expect(runs.isRunning('user-1')).toBe(false);
        expect(listener).toHaveBeenCalledTimes(2);

        unsubscribe();
        await runs.run('user-1', second);
        expect(second).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('clears the running state when the import rejects', async () => {
        const runs = new ScenarioImportRuns();
        const running = runs.run('user-1', () =>
            Promise.reject(new Error('offline')),
        );
        await expect(running).rejects.toThrow('offline');
        expect(runs.isRunning('user-1')).toBe(false);
    });
});

describe('clearAccountScenarios', () => {
    it('clears every saved scenario in one call and reports how many went', async () => {
        const removeAll = vi.fn(() => Promise.resolve({ removed: 3 }));
        const outcome = await clearAccountScenarios(3, removeAll);
        expect(outcome).toEqual({ error: null, removed: 3, total: 3 });
        expect(removeAll).toHaveBeenCalledTimes(1);
        expect(scenarioRemovalNotice(outcome)).toBeNull();
    });

    it('reports a failed clear and asks to try again', async () => {
        const removeAll = vi
            .fn<() => Promise<{ removed: number }>>()
            .mockRejectedValueOnce(new Error('Too many requests'));
        const outcome = await clearAccountScenarios(4, removeAll);
        expect(outcome).toEqual({
            error: 'Too many requests',
            removed: 0,
            total: 4,
        });
        expect(removeAll).toHaveBeenCalledTimes(1);
        const notice = scenarioRemovalNotice(outcome);
        expect(notice).toContain('Could not clear your saved scenarios');
        expect(notice).toContain('Too many requests');
        expect(notice).toContain('Clear all again');
        expect(notice).not.toContain(String.fromCodePoint(0x20_14));
    });
});

describe('errorMessage', () => {
    it('reads an error message and stringifies anything else', () => {
        expect(errorMessage(new Error('boom'))).toBe('boom');
        expect(errorMessage('plain')).toBe('plain');
    });
});

describe('accountScenarioRecords', () => {
    it('never shows cached rows that belong to another user', () => {
        const records = accountScenarioRecords(
            [
                stored('Mine', 'firm=apex'),
                stored(
                    'Theirs',
                    'firm=topstep',
                    new Date('2026-09-02T00:00:00Z'),
                    'user-2',
                ),
            ],
            'user-1',
        );
        expect(records.map((record) => record.name)).toEqual(['Mine']);
    });

    it('maps server rows to records newest first', () => {
        const records = accountScenarioRecords(
            [
                stored('Old', 'firm=apex', new Date('2026-09-01T00:00:00Z')),
                stored('New', 'firm=topstep', new Date('2026-09-20T00:00:00Z')),
            ],
            'user-1',
        );
        expect(records).toEqual([
            {
                id: 'id-New',
                name: 'New',
                params: 'firm=topstep',
                savedAt: Date.parse('2026-09-20T00:00:00Z'),
            },
            {
                id: 'id-Old',
                name: 'Old',
                params: 'firm=apex',
                savedAt: Date.parse('2026-09-01T00:00:00Z'),
            },
        ]);
    });
});

describe('validateAccountScenario', () => {
    it('accepts a valid scenario and trims the name', () => {
        expect(validateAccountScenario('  Apex  ', 'firm=apex')).toEqual({
            ok: true,
            scenario: { name: 'Apex', query: 'firm=apex' },
        });
    });

    it('rejects a query over 8,192 characters', () => {
        const result = validateAccountScenario(
            'Apex',
            `q=${'a'.repeat(MAX_SCENARIO_QUERY_LENGTH)}`,
        );
        expect(result.ok).toBe(false);
        expect(result.ok ? '' : result.error).toContain('8,192 characters');
    });

    it('rejects a name over 64 characters', () => {
        const result = validateAccountScenario(
            'x'.repeat(MAX_SCENARIO_NAME_LENGTH + 1),
            'firm=apex',
        );
        expect(result.ok).toBe(false);
        expect(result.ok ? '' : result.error).toContain('64 characters');
    });

    it('rejects a name with invisible characters', () => {
        const result = validateAccountScenario('Apex​', 'firm=apex');
        expect(result.ok).toBe(false);
    });
});
