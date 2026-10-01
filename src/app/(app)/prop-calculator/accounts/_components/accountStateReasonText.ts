import type { PropAccountRow } from '~/server/db/schemas/prop';

import {
    AccountStateUnavailableKind,
    type AccountStateUnavailableReason,
    describeUnresolvedPlan,
} from '~/lib/prop-accounts';
import { ReconstructionErrorReason } from '~/lib/prop-calculator/advisor';

export type AccountStateReasonAccount = Pick<
    PropAccountRow,
    'accountSize' | 'firmId' | 'planSerial'
>;

export function accountStateUnavailableText(
    account: AccountStateReasonAccount | undefined,
    reason: AccountStateUnavailableReason,
): string {
    switch (reason.kind) {
        case AccountStateUnavailableKind.ImplausibleSnapshot: {
            return reason.issues
                .map((issue) => issue.message.replace(/\.+$/u, ''))
                .join('; ');
        }
        case AccountStateUnavailableKind.LedgerOnly: {
            return 'it is a ledger-only account with no state to reconstruct';
        }
        case AccountStateUnavailableKind.NoSnapshot: {
            return 'it has no snapshot yet';
        }
        case AccountStateUnavailableKind.ReconstructionError: {
            return reconstructionErrorText(reason.reason);
        }
        case AccountStateUnavailableKind.UnresolvedPlan: {
            return account === undefined
                ? 'its plan could not be resolved'
                : describeUnresolvedPlan(
                      {
                          accountSize: account.accountSize,
                          firmId: account.firmId ?? 'unknown',
                          planSerial: account.planSerial ?? 'unknown',
                      },
                      reason.reason,
                  );
        }
    }
}

function reconstructionErrorText(reason: ReconstructionErrorReason): string {
    switch (reason) {
        case ReconstructionErrorReason.EodPeakRequired: {
            return 'its EOD-trailing drawdown needs the highest EOD balance on the snapshot';
        }
        case ReconstructionErrorReason.IntradayPeakRequired: {
            return 'its intraday-trailing drawdown needs the highest intraday balance on the snapshot';
        }
    }
}
