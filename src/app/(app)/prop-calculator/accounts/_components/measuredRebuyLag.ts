import {
    PortfolioLedger,
    RebuyLagBasis,
    rebuyLagDefault,
    replacementStats,
} from '~/lib/prop-accounts';
import { type MeasuredRebuyLag } from '~/lib/prop-calculator/advisor';
import { type RouterOutputs } from '~/trpc/react';

import { ledgerOrDateFailure, OverviewSectionStatus } from './overview/overviewModel';

export enum RebuyLagLineKind {
    Failed = 'failed',
    Measured = 'measured',
}

export type RebuyLagLine =
    | { readonly kind: RebuyLagLineKind.Failed; readonly message: string }
    | { readonly kind: RebuyLagLineKind.Measured; readonly value: MeasuredRebuyLag };

type LedgerAccountRow = RouterOutputs['propAccounts']['account']['list'][number];

type LedgerEventRow = RouterOutputs['propAccounts']['event']['list'][number];

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
        rebuyLagDefault(
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
    return computed.value.basis === RebuyLagBasis.Measured
        ? {
              kind: RebuyLagLineKind.Measured,
              value: {
                  days: computed.value.days,
                  samples: computed.value.samples,
              },
          }
        : null;
}
