import { useMemo } from 'react';

import {
    FROM_STATE_NOT_MODELED_TEXT,
    type FromStateDetail,
    FromStateDetailKind,
    fromStateDetailRequestsOf,
} from '~/app/(app)/prop-calculator/accounts/_components/detail/fromStateDetail';
import { NextPayoutSection } from '~/app/(app)/prop-calculator/accounts/_components/detail/NextPayoutSection';
import { useOverviewWorker } from '~/app/(app)/prop-calculator/accounts/_components/overview/useOverviewWorker';
import { type PersonalRules } from '~/lib/prop-accounts';
import { type Plan } from '~/lib/prop-calculator';
import {
    type AccountSnapshotInput,
    type MeasuredRebuyLag,
    NO_PENDING_PAYOUT_COUNTS,
    type ReconstructedAccount,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';

export function NextPayoutSectionWithWorker({
    account,
    input,
    measuredRebuyLag,
    personalRules,
    plan,
    rulebook,
    rulebookError,
}: {
    readonly account: ReconstructedAccount;
    readonly input: AccountSnapshotInput;
    readonly measuredRebuyLag: MeasuredRebuyLag | null;
    readonly personalRules?: null | PersonalRules;
    readonly plan: Plan;
    readonly rulebook: RulebookParameters | undefined;
    readonly rulebookError: null | string;
}) {
    const requests = useMemo(
        () =>
            rulebook === undefined
                ? null
                : fromStateDetailRequestsOf({
                      input,
                      measuredRebuyLag,
                      pendingPayoutCounts: NO_PENDING_PAYOUT_COUNTS,
                      personalMaxRiskPerTrade: null,
                      personalRules,
                      plan,
                      rulebook,
                  }),
        [input, measuredRebuyLag, personalRules, plan, rulebook],
    );
    const engineRequests = useMemo(
        () =>
            requests === null
                ? []
                : [requests.account, requests.retire, requests.chain],
        [requests],
    );
    const engine = useOverviewWorker(engineRequests);
    const detail: FromStateDetail =
        requests === null
            ? {
                  kind: FromStateDetailKind.Unavailable,
                  reason: FROM_STATE_NOT_MODELED_TEXT,
              }
            : { engine, kind: FromStateDetailKind.Ready, requests };
    return (
        <NextPayoutSection
            account={account}
            detail={detail}
            input={input}
            rulebook={rulebook}
            rulebookError={rulebookError}
        />
    );
}
