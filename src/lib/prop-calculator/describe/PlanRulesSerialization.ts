import { stableJson } from '~/lib/stableJson';

import { type DrawdownLockConfig, type Plan } from '../core';

const DESCRIPTIVE_KEYS: ReadonlySet<string> = new Set(['label', 'notes']);

export function serializePlanRules(plan: Plan): string {
    return stableJson(structuralValue(plan, plan.accountSize, 'plan'));
}

function isDrawdownLock(value: object): value is DrawdownLockConfig {
    return (
        'atProfit' in value &&
        'lockedThreshold' in value &&
        typeof value.lockedThreshold === 'function'
    );
}

function structuralValue(
    value: unknown,
    accountSize: number,
    path: string,
): unknown {
    if (typeof value === 'function' || typeof value === 'symbol') {
        throw new TypeError(
            `serializePlanRules cannot serialize the ${typeof value} at ${path}`,
        );
    }
    if (typeof value !== 'object' || value === null) return value;
    if (Array.isArray(value)) {
        return value.map((item, index) =>
            structuralValue(item, accountSize, `${path}[${index}]`),
        );
    }
    if (value instanceof Map || value instanceof Set) {
        throw new TypeError(
            `serializePlanRules cannot serialize the collection at ${path}`,
        );
    }
    if (isDrawdownLock(value)) {
        return {
            atProfit: value.atProfit,
            lockedOffset: value.lockedThreshold(accountSize) - accountSize,
        };
    }
    return Object.fromEntries(
        Object.entries(value)
            .filter(([key]) => !DESCRIPTIVE_KEYS.has(key))
            .map(([key, nested]) => [
                key,
                structuralValue(nested, accountSize, `${path}.${key}`),
            ]),
    );
}
