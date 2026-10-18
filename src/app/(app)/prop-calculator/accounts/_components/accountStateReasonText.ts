import type { PropAccountRow } from '~/server/db/schemas/prop';

import {
    type AccountExposureUnavailableReason,
    AccountStateUnavailableKind,
    type AccountStateUnavailableReason,
    describeUnresolvedPlan,
    ExposureUnavailableKind,
    FirmCountUnknownReason,
} from '~/lib/prop-accounts';
import { ReconstructionErrorReason } from '~/lib/prop-calculator/advisor';

export type AccountStateReasonAccount = Pick<
    PropAccountRow,
    'accountSize' | 'firmId' | 'planSerial'
>;

const LIVE_EXPOSURE_NOT_MODELED_TEXT =
    'sizing is not modeled yet for live accounts';

export function accountStateUnavailableText(
    account: AccountStateReasonAccount | undefined,
    reason: AccountStateUnavailableReason,
): string {
    switch (reason.kind) {
        case AccountStateUnavailableKind.FirmCountUnknown: {
            return firmCountUnknownText(reason.reason);
        }
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

export function exposureUnavailableText(
    account: AccountStateReasonAccount | undefined,
    reason: AccountExposureUnavailableReason,
): string {
    switch (reason.kind) {
        case ExposureUnavailableKind.LiveNotModeled: {
            return LIVE_EXPOSURE_NOT_MODELED_TEXT;
        }
        case ExposureUnavailableKind.Reconstruction: {
            return accountStateUnavailableText(account, reason.reason);
        }
    }
}

function firmCountUnknownText(reason: FirmCountUnknownReason): string {
    switch (reason) {
        case FirmCountUnknownReason.InvalidDate: {
            return "a payout or live-move date at its firm is not a valid date, so the firm's payout count is unknown";
        }
        case FirmCountUnknownReason.UnreadableAccount: {
            return "an account at its firm cannot be read, so the firm's payout count is unknown";
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
