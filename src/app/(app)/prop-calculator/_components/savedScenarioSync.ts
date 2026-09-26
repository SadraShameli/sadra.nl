import type { PropSavedScenarioRow } from '~/server/db/schemas/prop';

import { errorMessage } from '~/lib/errorMessage';
import {
    PropLimitRejection,
    PropQuota,
    propRejectionSchema,
} from '~/lib/schemas/propAccountOutputs';
import {
    MAX_SCENARIO_NAME_LENGTH,
    MAX_SCENARIO_QUERY_LENGTH,
    scenarioSaveSchema,
} from '~/lib/schemas/propAccounts';

import type { SavedScenarioRecord } from './urlState';

export { errorMessage } from '~/lib/errorMessage';

export enum ScenarioImportStatus {
    AlreadyImported = 'already-imported',
    Anonymous = 'anonymous',
    Failed = 'failed',
    Imported = 'imported',
}

export enum ScenarioSkipReason {
    AccountLimit = 'account-limit',
    InvalidName = 'invalid-name',
    InvalidQuery = 'invalid-query',
    NameTaken = 'name-taken',
    QueryTooLong = 'query-too-long',
}

export enum ScenarioStore {
    Account = 'account',
    Local = 'local',
    Pending = 'pending',
    Unavailable = 'unavailable',
}

export interface AccountScenarioRecord extends SavedScenarioRecord {
    id: string;
}

export type AccountScenarioValidation =
    { error: string; ok: false } | { ok: true; scenario: ScenarioImport };

export type FlagStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface ScenarioImport {
    name: string;
    query: string;
}

export type ScenarioImportOutcome =
    | {
          error: string;
          imported: number;
          skipped: ScenarioImportSkip[];
          status: ScenarioImportStatus.Failed;
      }
    | {
          imported: number;
          skipped: ScenarioImportSkip[];
          status: ScenarioImportStatus.Imported;
      }
    | { status: ScenarioImportStatus.AlreadyImported }
    | { status: ScenarioImportStatus.Anonymous };

export interface ScenarioImportPlan {
    imports: ScenarioImport[];
    skipped: ScenarioImportSkip[];
}

export interface ScenarioImportRequest {
    importMany: (scenarios: ScenarioImport[]) => Promise<ScenarioImportResult>;
    local: readonly SavedScenarioRecord[];
    server: readonly Pick<StoredScenario, 'name' | 'query'>[];
    storage?: FlagStorage | null;
    userId: null | string;
}

export interface ScenarioImportResult {
    imported: readonly Pick<ScenarioImport, 'name'>[];
    skippedNames: readonly string[];
}

export interface ScenarioImportSkip {
    name: string;
    reason: ScenarioSkipReason;
}

export interface ScenarioRemovalOutcome {
    error: null | string;
    removed: number;
    total: number;
}

export type StoredScenario = Pick<
    PropSavedScenarioRow,
    'id' | 'name' | 'query' | 'updatedAt' | 'userId'
>;

interface ScenarioImportBatch {
    imported: number;
    skipped: ScenarioImportSkip[];
}

export class ScenarioImportRuns {
    private readonly listeners = new Set<() => void>();
    private readonly running = new Set<string>();

    private notify(): void {
        for (const listener of this.listeners) listener();
    }

    private async track<T>(userId: string, task: () => Promise<T>): Promise<T> {
        this.running.add(userId);
        this.notify();
        try {
            return await task();
        } finally {
            this.running.delete(userId);
            this.notify();
        }
    }

    isRunning(userId: string): boolean {
        return this.running.has(userId);
    }

    run<T>(userId: string, task: () => Promise<T>): null | Promise<T> {
        return this.running.has(userId) ? null : this.track(userId, task);
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
}

const IMPORT_FLAG_KEY_PREFIX = 'propCalc.scenarios.imported.v1:';
const IMPORT_FLAG_VALUE = '1';
const QUERY_LIMIT_LABEL = MAX_SCENARIO_QUERY_LENGTH.toLocaleString('en-US');

const SKIP_REASON_LABELS: Readonly<Record<ScenarioSkipReason, string>> = {
    [ScenarioSkipReason.AccountLimit]: 'account limit reached',
    [ScenarioSkipReason.InvalidName]: 'invalid name',
    [ScenarioSkipReason.InvalidQuery]: 'invalid link',
    [ScenarioSkipReason.NameTaken]: 'name already saved to your account',
    [ScenarioSkipReason.QueryTooLong]: `over ${QUERY_LIMIT_LABEL} characters`,
};

const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });

export function accountScenarioRecords(
    rows: readonly StoredScenario[],
    userId: string,
): AccountScenarioRecord[] {
    return rows
        .filter((row) => row.userId === userId)
        .map((row) => ({
            id: row.id,
            name: row.name,
            params: row.query,
            savedAt: row.updatedAt.getTime(),
        }))
        .toSorted((a, b) => b.savedAt - a.savedAt);
}

export async function clearAccountScenarios(
    total: number,
    removeAll: () => Promise<{ removed: number }>,
): Promise<ScenarioRemovalOutcome> {
    try {
        const { removed } = await removeAll();
        return { error: null, removed, total };
    } catch (error) {
        return { error: errorMessage(error), removed: 0, total };
    }
}

export async function importLocalScenarios(
    request: ScenarioImportRequest,
): Promise<ScenarioImportOutcome> {
    const { userId } = request;
    if (userId === null) return { status: ScenarioImportStatus.Anonymous };
    const storage =
        request.storage === undefined ? localStorageOrNull() : request.storage;
    if (isScenarioImportDone(userId, storage)) {
        return { status: ScenarioImportStatus.AlreadyImported };
    }
    const { imports, skipped } = planScenarioImport(
        request.local,
        request.server,
    );
    let batch: ScenarioImportBatch;
    try {
        batch = await importWithinQuota(
            request.importMany,
            imports,
            request.server.length,
        );
    } catch (error) {
        return {
            error: errorMessage(error),
            imported: 0,
            skipped,
            status: ScenarioImportStatus.Failed,
        };
    }
    markScenarioImportDone(userId, storage);
    return {
        imported: batch.imported,
        skipped: [...skipped, ...batch.skipped],
        status: ScenarioImportStatus.Imported,
    };
}

export function isScenarioImportDone(
    userId: string,
    storage: FlagStorage | null = localStorageOrNull(),
): boolean {
    if (storage === null) return false;
    try {
        return storage.getItem(importFlagKey(userId)) === IMPORT_FLAG_VALUE;
    } catch {
        return false;
    }
}

export function markScenarioImportDone(
    userId: string,
    storage: FlagStorage | null = localStorageOrNull(),
): void {
    if (storage === null) return;
    try {
        storage.setItem(importFlagKey(userId), IMPORT_FLAG_VALUE);
    } catch {
        return;
    }
}

export function planScenarioImport(
    local: readonly SavedScenarioRecord[],
    server: readonly Pick<StoredScenario, 'name' | 'query'>[],
): ScenarioImportPlan {
    const taken = new Map(server.map((row) => [row.name, row.query]));
    const imports: ScenarioImport[] = [];
    const skipped: ScenarioImportSkip[] = [];
    for (const record of local) {
        const reason = importSkipReason(record);
        if (reason !== null) {
            skipped.push({ name: record.name, reason });
            continue;
        }
        const name = firstFreeName(record, taken);
        if (name === null) continue;
        taken.set(name, record.params);
        imports.push({ name, query: record.params });
    }
    return { imports, skipped };
}

export function scenarioImportNotice(
    outcome: ScenarioImportOutcome,
): null | string {
    switch (outcome.status) {
        case ScenarioImportStatus.AlreadyImported:
        case ScenarioImportStatus.Anonymous: {
            return null;
        }
        case ScenarioImportStatus.Failed: {
            return joinSentences([
                `Could not import every saved scenario from this browser: ${outcome.error}. Imported ${String(outcome.imported)} so far; the rest will retry next time you open saved scenarios.`,
                skippedSentence(outcome.skipped),
            ]);
        }
        case ScenarioImportStatus.Imported: {
            return joinSentences([
                importedSentence(outcome.imported),
                skippedSentence(outcome.skipped),
            ]);
        }
    }
}

export function scenarioRemovalNotice(
    outcome: ScenarioRemovalOutcome,
): null | string {
    return outcome.error === null
        ? null
        : `Could not clear your saved scenarios: ${outcome.error}. Use Clear all again if any are still listed.`;
}

export function scenarioStoreFor(session: {
    hasError?: boolean;
    isPending: boolean;
    userId: null | string;
}): ScenarioStore {
    if (session.isPending) return ScenarioStore.Pending;
    if (session.userId !== null) return ScenarioStore.Account;
    return session.hasError === true
        ? ScenarioStore.Unavailable
        : ScenarioStore.Local;
}

export function validateAccountScenario(
    name: string,
    query: string,
): AccountScenarioValidation {
    if (query.length > MAX_SCENARIO_QUERY_LENGTH) {
        return {
            error: `This scenario's link is over ${QUERY_LIMIT_LABEL} characters, so it cannot be saved to your account.`,
            ok: false,
        };
    }
    const trimmed = name.trim();
    if (trimmed.length > MAX_SCENARIO_NAME_LENGTH) {
        return {
            error: `Names can be at most ${String(MAX_SCENARIO_NAME_LENGTH)} characters.`,
            ok: false,
        };
    }
    const parsed = scenarioSaveSchema.safeParse({ name, query });
    if (!parsed.success) {
        return {
            error: `This scenario cannot be saved: ${parsed.error.issues.map((issue) => issue.message).join('; ')}.`,
            ok: false,
        };
    }
    return { ok: true, scenario: parsed.data };
}

function batchOf(result: ScenarioImportResult): ScenarioImportBatch {
    return {
        imported: result.imported.length,
        skipped: result.skippedNames.map((name) => ({
            name,
            reason: ScenarioSkipReason.NameTaken,
        })),
    };
}

function candidateName(name: string, attempt: number): string {
    const suffix = attempt === 1 ? '' : ` (${String(attempt)})`;
    return `${fitToLength(name.trim(), MAX_SCENARIO_NAME_LENGTH - suffix.length)}${suffix}`;
}

function firstFreeName(
    record: SavedScenarioRecord,
    taken: ReadonlyMap<string, string>,
): null | string {
    for (let attempt = 1; attempt <= taken.size + 1; attempt += 1) {
        const name = candidateName(record.name, attempt);
        const existing = taken.get(name);
        if (existing === undefined) return name;
        if (existing === record.params) return null;
    }
    return null;
}

function fitToLength(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    let fitted = '';
    for (const { segment } of graphemes.segment(text)) {
        if (fitted.length + segment.length > maxLength) break;
        fitted += segment;
    }
    return fitted.trimEnd();
}

function importedSentence(imported: number): null | string {
    if (imported === 0) return null;
    const noun = imported === 1 ? 'saved scenario' : 'saved scenarios';
    return `Imported ${String(imported)} ${noun} from this browser to your account.`;
}

function importFlagKey(userId: string): string {
    return `${IMPORT_FLAG_KEY_PREFIX}${userId}`;
}

function importSkipReason(
    record: SavedScenarioRecord,
): null | ScenarioSkipReason {
    if (record.params.length > MAX_SCENARIO_QUERY_LENGTH) {
        return ScenarioSkipReason.QueryTooLong;
    }
    if (!scenarioSaveSchema.shape.query.safeParse(record.params).success) {
        return ScenarioSkipReason.InvalidQuery;
    }
    return scenarioSaveSchema.shape.name.safeParse(
        candidateName(record.name, 1),
    ).success
        ? null
        : ScenarioSkipReason.InvalidName;
}

async function importWithinQuota(
    importMany: ScenarioImportRequest['importMany'],
    imports: readonly ScenarioImport[],
    storedCount: number,
): Promise<ScenarioImportBatch> {
    if (imports.length === 0) return { imported: 0, skipped: [] };
    try {
        return batchOf(await importMany([...imports]));
    } catch (error) {
        const limit = scenarioQuotaLimit(error);
        if (limit === null) throw error;
        const room = Math.max(0, limit - storedCount);
        if (room === 0 || room >= imports.length) {
            return { imported: 0, skipped: overLimit(imports) };
        }
        let retried: ScenarioImportResult;
        try {
            retried = await importMany(imports.slice(0, room));
        } catch (retryError) {
            if (scenarioQuotaLimit(retryError) === null) throw retryError;
            return { imported: 0, skipped: overLimit(imports) };
        }
        const batch = batchOf(retried);
        return {
            imported: batch.imported,
            skipped: [...batch.skipped, ...overLimit(imports.slice(room))],
        };
    }
}

function joinSentences(sentences: readonly (null | string)[]): null | string {
    const present = sentences.filter((sentence) => sentence !== null);
    return present.length === 0 ? null : present.join(' ');
}

function localStorageOrNull(): FlagStorage | null {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
}

function overLimit(imports: readonly ScenarioImport[]): ScenarioImportSkip[] {
    return imports.map(({ name }) => ({
        name,
        reason: ScenarioSkipReason.AccountLimit,
    }));
}

function scenarioQuotaLimit(error: unknown): null | number {
    if (!(error instanceof Error)) return null;
    const data: unknown = Reflect.get(error, 'data');
    if (typeof data !== 'object' || data === null) return null;
    const rejection = propRejectionSchema.safeParse(
        Reflect.get(data, 'propRejection'),
    );
    return rejection.success &&
        rejection.data.reason === PropLimitRejection.QuotaExceeded &&
        rejection.data.quota === PropQuota.Scenarios
        ? (rejection.data.limit ?? 0)
        : null;
}

function skippedSentence(
    skipped: readonly ScenarioImportSkip[],
): null | string {
    if (skipped.length === 0) return null;
    const items = skipped
        .map((skip) => `${skip.name} (${SKIP_REASON_LABELS[skip.reason]})`)
        .join(', ');
    return `Not imported, kept in this browser: ${items}.`;
}
