import type { SnapshotField } from '~/lib/prop-accounts/snapshots';

import { formatConjunctionList } from '~/lib/format';

import {
    describeLifecycleRejection,
    LifecycleRejection,
    type PlanLifecycleFacts,
} from './AccountLifecycle';
import { type AccountStage } from './AccountStage';

export const LEDGER_ONLY_SNAPSHOT_FIELDS = [
    'asOf',
    'balanceCents',
    'dashboardFloorCents',
    'payoutsTaken',
    'cumulativePayoutCents',
] as const satisfies readonly `${SnapshotField}`[];

export type LedgerOnlySnapshotField =
    (typeof LEDGER_ONLY_SNAPSHOT_FIELDS)[number];

export const LEDGER_ONLY_SNAPSHOT_FIELD_NAMES: Readonly<
    Record<LedgerOnlySnapshotField, string>
> = {
    asOf: 'the snapshot date',
    balanceCents: 'the balance',
    cumulativePayoutCents: 'the cumulative payouts',
    dashboardFloorCents: 'the dashboard floor',
    payoutsTaken: 'the payouts taken',
};

export const LEDGER_ONLY_SNAPSHOT_FIELD_LIST = formatConjunctionList(
    LEDGER_ONLY_SNAPSHOT_FIELDS.map(
        (field) => LEDGER_ONLY_SNAPSHOT_FIELD_NAMES[field],
    ),
);

export const LEDGER_ONLY_LIFECYCLE_FACTS: PlanLifecycleFacts = {
    fundedReset: null,
    isInstantFunded: false,
};

const LEDGER_ONLY_FUNDED_RESET_REFUSAL =
    'A ledger-only account has no plan rules that offer a funded reset; record the firm reinstating it as a bust reversal with a note, or upgrade the account to a modeled plan first';

const LEDGER_ONLY_SNAPSHOT_FIELD_SET: ReadonlySet<string> = new Set(
    LEDGER_ONLY_SNAPSHOT_FIELDS,
);

export function describeLedgerOnlyLifecycleRejection(
    rejection: LifecycleRejection,
    stage: AccountStage | null,
): string {
    return rejection === LifecycleRejection.FundedResetNotOffered
        ? LEDGER_ONLY_FUNDED_RESET_REFUSAL
        : describeLifecycleRejection(rejection, {
              facts: LEDGER_ONLY_LIFECYCLE_FACTS,
              stage,
          });
}

export function isLedgerOnlySnapshotField(field: string): boolean {
    return LEDGER_ONLY_SNAPSHOT_FIELD_SET.has(field);
}
