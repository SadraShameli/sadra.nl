import { type ComputationId, type ComputationResultMap } from './ComputationId';

export type ComputationInitial<Id extends ComputationId> =
    | {
          pending: false;
          result: ComputationResultMap[Id];
          shouldCompute: false;
      }
    | { pending: true; result: null; shouldCompute: true };

type CachedResult = ComputationResultMap[ComputationId];

export const DEFAULT_COMPUTATION_CACHE_CAPACITY = 64;

export class ComputationCache {
    private readonly entries = new Map<string, CachedResult>();

    constructor(readonly capacity = DEFAULT_COMPUTATION_CACHE_CAPACITY) {
        if (!Number.isSafeInteger(capacity) || capacity < 1) {
            throw new RangeError(
                `Computation cache capacity must be a positive integer, got ${capacity}`,
            );
        }
    }

    get size(): number {
        return this.entries.size;
    }

    get<Id extends ComputationId>(
        id: Id,
        key: string,
    ): ComputationResultMap[Id] | undefined {
        const composite = entryKey(id, key);
        if (!this.entries.has(composite)) return undefined;
        const result = this.entries.get(composite) as ComputationResultMap[Id];
        this.entries.delete(composite);
        this.entries.set(composite, result);
        return result;
    }

    set<Id extends ComputationId>(
        id: Id,
        key: string,
        result: ComputationResultMap[Id],
    ): void {
        const composite = entryKey(id, key);
        this.entries.delete(composite);
        this.entries.set(composite, result);
        while (this.entries.size > this.capacity) {
            const oldest = this.entries.keys().next();
            if (oldest.done) return;
            this.entries.delete(oldest.value);
        }
    }
}

export function initialFor<Id extends ComputationId>(
    id: Id,
    key: string,
    cache: ComputationCache,
): ComputationInitial<Id> {
    const cached = cache.get(id, key);
    return cached === undefined
        ? { pending: true, result: null, shouldCompute: true }
        : { pending: false, result: cached, shouldCompute: false };
}

function entryKey(id: ComputationId, key: string): string {
    return JSON.stringify([id, key]);
}
