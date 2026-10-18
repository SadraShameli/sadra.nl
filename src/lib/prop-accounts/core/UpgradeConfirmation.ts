import {
    type ExternalFirmName,
    type FirmColumns,
    type FirmKey,
    FirmKeyKind,
    firmKeyLabel,
    firmKeyOf,
} from './FirmKey';
import { type StoredFirmId } from './PlanKey';
import { formatUsdCents, usdCentsFromDollars } from './UsdCents';

export enum UpgradeChangeKind {
    Firm = 'firm',
    Size = 'size',
}

export type UpgradeChange =
    | {
          readonly from: FirmKey;
          readonly kind: UpgradeChangeKind.Firm;
          readonly to: StoredFirmId;
      }
    | {
          readonly from: number;
          readonly kind: UpgradeChangeKind.Size;
          readonly to: number;
      };

export type UpgradeSource = FirmColumns & { readonly accountSize: number };

export interface UpgradeTarget {
    readonly accountSize: number;
    readonly firmId: StoredFirmId;
}

export function upgradeChanges(
    stored: UpgradeSource,
    target: UpgradeTarget,
): readonly UpgradeChange[] {
    const storedFirm = firmKeyOf(stored);
    return [
        ...(stored.accountSize === target.accountSize
            ? []
            : [
                  {
                      from: stored.accountSize,
                      kind: UpgradeChangeKind.Size,
                      to: target.accountSize,
                  } as const,
              ]),
        ...(isSameFirm(storedFirm, target.firmId)
            ? []
            : [
                  {
                      from: storedFirm,
                      kind: UpgradeChangeKind.Firm,
                      to: target.firmId,
                  } as const,
              ]),
    ];
}

export function upgradeChangeText(
    change: UpgradeChange,
    externalFirms: readonly ExternalFirmName[],
): string {
    switch (change.kind) {
        case UpgradeChangeKind.Firm: {
            return `the firm from ${firmKeyLabel(change.from, externalFirms)} to ${firmKeyLabel({ firmId: change.to, kind: FirmKeyKind.Modeled }, externalFirms)}`;
        }
        case UpgradeChangeKind.Size: {
            return `the account size from ${sizeLabel(change.from)} to ${sizeLabel(change.to)}`;
        }
    }
}

function isSameFirm(stored: FirmKey, target: StoredFirmId): boolean {
    switch (stored.kind) {
        case FirmKeyKind.External: {
            return false;
        }
        case FirmKeyKind.Modeled: {
            return stored.firmId === target;
        }
    }
}

function sizeLabel(accountSize: number): string {
    return formatUsdCents(usdCentsFromDollars(accountSize));
}
