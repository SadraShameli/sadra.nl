export interface CopyGroupKey {
    readonly copyGroupId: null | string;
    readonly purchasedOn: string;
}

export function independentSampleCount(
    items: readonly CopyGroupKey[],
): number {
    return independentSamples(items).length;
}

export function independentSamples<T extends CopyGroupKey>(
    items: readonly T[],
): readonly (readonly T[])[] {
    const groups: T[][] = [];
    const indexByKey = new Map<string, number>();
    for (const item of items) {
        if (item.copyGroupId === null) {
            groups.push([item]);
            continue;
        }
        const key = `${item.copyGroupId}::${item.purchasedOn}`;
        const existingIndex = indexByKey.get(key);
        if (existingIndex === undefined) {
            indexByKey.set(key, groups.length);
            groups.push([item]);
        } else {
            groups[existingIndex]?.push(item);
        }
    }
    return groups;
}
