import {
    measuredRebuyLagOfDefault,
    PortfolioLedger,
    rebuyLagDefault,
    type ReplacementStats,
    replacementStats,
} from '~/lib/prop-accounts';
import { type MeasuredRebuyLag } from '~/lib/prop-calculator/advisor';
import { type RouterOutputs } from '~/trpc/react';

import {
    ledgerOrDateFailure,
    OverviewSectionStatus,
} from './overview/overviewModel';

export enum RebuyLagLineKind {
    Failed = 'failed',
    Measured = 'measured',
}

export type RebuyLagLine =
    | { readonly kind: RebuyLagLineKind.Failed; readonly message: string }
    | {
          readonly kind: RebuyLagLineKind.Measured;
          readonly value: MeasuredRebuyLag;
      };

type LedgerAccountRow =
    RouterOutputs['propAccounts']['account']['list'][number];

type LedgerEventRow = RouterOutputs['propAccounts']['event']['list'][number];

export function measuredRebuyLagFromStats(
    stats: ReplacementStats,
    planSerial: string,
): MeasuredRebuyLag | null {
    return measuredRebuyLagOfDefault(rebuyLagDefault(stats, planSerial));
}

export function measuredRebuyLagOf(args: {
    readonly accounts: readonly LedgerAccountRow[] | undefined;
    readonly events: readonly LedgerEventRow[] | undefined;
    readonly planSerial: null | string;
    readonly userId: string | undefined;
}): null | RebuyLagLine {
    const { accounts, events, planSerial, userId } = args;
    if (
        accounts === undefined ||
        events === undefined ||
        userId === undefined ||
        planSerial === null
    ) {
        return null;
    }
    const computed = ledgerOrDateFailure(() =>
        measuredRebuyLagFromStats(
            replacementStats(
                PortfolioLedger.fromRows(userId, {
                    accounts,
                    events,
                    fees: [],
                    payouts: [],
                }),
            ),
            planSerial,
        ),
    );
    if (computed.kind === OverviewSectionStatus.Failed) {
        return { kind: RebuyLagLineKind.Failed, message: computed.message };
    }
    return computed.value === null
        ? null
        : { kind: RebuyLagLineKind.Measured, value: computed.value };
}
