import { compareText } from './IsoDate';
import { findStoredFirm, type StoredFirmId } from './PlanKey';

export enum FirmKeyKind {
    External = 'external',
    Modeled = 'modeled',
}

export interface ExternalFirmName {
    readonly id: string;
    readonly name: string;
}

export type FirmColumns =
    | { readonly externalFirmId: null; readonly firmId: StoredFirmId }
    | { readonly externalFirmId: string; readonly firmId: null };

export interface FirmColumnsRow {
    readonly externalFirmId: null | string;
    readonly firmId: null | StoredFirmId;
}

export type FirmKey =
    | {
          readonly externalFirmId: string;
          readonly kind: FirmKeyKind.External;
      }
    | {
          readonly firmId: StoredFirmId;
          readonly kind: FirmKeyKind.Modeled;
      };

export interface FirmKeyGroup<Item> {
    readonly firmKey: FirmKey;
    readonly items: readonly Item[];
}

export const UNLISTED_FIRM_LABEL = 'Unlisted firm';

export function compareFirmKeys(a: FirmKey, b: FirmKey): number {
    return compareText(firmKeyId(a), firmKeyId(b));
}

export function firmKeyId(key: FirmKey): string {
    switch (key.kind) {
        case FirmKeyKind.External: {
            return `${FirmKeyKind.External}:${key.externalFirmId}`;
        }
        case FirmKeyKind.Modeled: {
            return `${FirmKeyKind.Modeled}:${key.firmId}`;
        }
    }
}

export function firmKeyLabel(
    key: FirmKey,
    externalFirms: readonly ExternalFirmName[],
): string {
    switch (key.kind) {
        case FirmKeyKind.External: {
            return (
                externalFirms.find((firm) => firm.id === key.externalFirmId)
                    ?.name ?? UNLISTED_FIRM_LABEL
            );
        }
        case FirmKeyKind.Modeled: {
            return findStoredFirm(key.firmId)?.displayName ?? key.firmId;
        }
    }
}

export function firmKeyOf(row: FirmColumns): FirmKey {
    return row.firmId === null
        ? { externalFirmId: row.externalFirmId, kind: FirmKeyKind.External }
        : { firmId: row.firmId, kind: FirmKeyKind.Modeled };
}

export function groupByFirmKey<Item>(
    items: readonly Item[],
    keyOf: (item: Item) => FirmKey,
): readonly FirmKeyGroup<Item>[] {
    const groups = new Map<string, { firmKey: FirmKey; items: Item[] }>();
    for (const item of items) {
        const firmKey = keyOf(item);
        const id = firmKeyId(firmKey);
        const group = groups.get(id);
        if (group === undefined) {
            groups.set(id, { firmKey, items: [item] });
        } else {
            group.items.push(item);
        }
    }
    return groups
        .values()
        .toArray()
        .toSorted((a, b) => compareFirmKeys(a.firmKey, b.firmKey));
}
