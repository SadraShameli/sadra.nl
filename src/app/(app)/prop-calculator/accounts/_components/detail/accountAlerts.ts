import {
    accountStatesFromLoad,
    alertExtrasOf,
    alertsFor,
    combinedNote,
    decisionsCaveatFor,
    type OverviewAlerts,
    portfolioLoad,
    type PortfolioLoad,
    type PortfolioQueries,
    PortfolioSource,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import {
    type AccountAlert,
    AlertSubjectKind,
    NO_ACCOUNT_STATES,
} from '~/lib/prop-accounts';

interface AccountAlertInputs {
    readonly accountId: string;
    readonly queries: AccountAlertQueries;
    readonly today: string;
}

type AccountAlertQueries = Partial<
    Pick<
        PortfolioQueries,
        | PortfolioSource.Decisions
        | PortfolioSource.Events
        | PortfolioSource.Fees
        | PortfolioSource.Transfers
    >
> &
    Pick<
        PortfolioQueries,
        | PortfolioSource.Accounts
        | PortfolioSource.CopyGroups
        | PortfolioSource.Payouts
        | PortfolioSource.Rulebook
        | PortfolioSource.Snapshots
    >;

const LEDGER_ONLY_SOURCE = { data: undefined, error: null } as const;

const DAY_LOSS_NOT_LOADED =
    'The alert for a large day loss is not checked here because your fees and bankroll deposits and withdrawals are not loaded on this page.';

const WITHDRAWABLE_DROP_NOT_LOADED =
    'The alert for a fall in the withdrawable amount of a payout-ready account is not checked here because your account history is not loaded on this page.';

const DECISIONS_NOT_LOADED =
    'The alert for risk above the documented rung on a payout-ready account is not checked here because your sizing decisions are not loaded on this page.';

export function accountAlerts({
    accountId,
    queries,
    today,
}: AccountAlertInputs): OverviewAlerts {
    const eventsQuery = queries[PortfolioSource.Events];
    const isLedgerWired =
        eventsQuery !== undefined &&
        queries[PortfolioSource.Fees] !== undefined &&
        queries[PortfolioSource.Transfers] !== undefined;
    const load = portfolioLoad({
        ...queries,
        [PortfolioSource.Decisions]:
            queries[PortfolioSource.Decisions] ?? LEDGER_ONLY_SOURCE,
        [PortfolioSource.Events]: eventsQuery ?? LEDGER_ONLY_SOURCE,
        [PortfolioSource.Fees]:
            queries[PortfolioSource.Fees] ?? LEDGER_ONLY_SOURCE,
        [PortfolioSource.Transfers]:
            queries[PortfolioSource.Transfers] ?? LEDGER_ONLY_SOURCE,
        [PortfolioSource.Violations]: LEDGER_ONLY_SOURCE,
    });
    const userId = queries[PortfolioSource.Accounts].data?.find(
        (account) => account.id === accountId,
    )?.userId;
    const hasUser = userId !== undefined;
    return alertsFor(
        load.alerts,
        today,
        (alert) => isAboutAccount(alert, accountId),
        isLedgerWired && hasUser
            ? accountStatesFromLoad(userId, today, load)
            : NO_ACCOUNT_STATES,
        isLedgerWired ? load.ledger : null,
        null,
        eventsQuery?.data,
        {
            ...(hasUser && alertExtrasOf(load, today, userId)),
            decisionsCaveat: combinedNote(
                decisionsNoteOf(load, queries),
                isLedgerWired ? null : ledgerOnlyCaveatOf(load),
            ),
        },
    );
}

function decisionsNoteOf(
    load: PortfolioLoad,
    queries: AccountAlertQueries,
): null | string {
    if (queries[PortfolioSource.Decisions] !== undefined) {
        return decisionsCaveatFor(load);
    }
    return (load.rulebook?.alerts.payoutReadyRiskAboveRungCents ?? null) ===
        null
        ? null
        : DECISIONS_NOT_LOADED;
}

function isAboutAccount(alert: AccountAlert, accountId: string): boolean {
    const { subject } = alert;
    switch (subject.kind) {
        case AlertSubjectKind.Account: {
            return subject.accountId === accountId;
        }
        case AlertSubjectKind.CopyGroup:
        case AlertSubjectKind.Portfolio: {
            return subject.accountIds.includes(accountId);
        }
    }
}

function ledgerOnlyCaveatOf(load: PortfolioLoad): null | string {
    const thresholds = load.rulebook?.alerts;
    return combinedNote(
        (thresholds?.dayLossBankrollFraction ?? null) === null
            ? null
            : DAY_LOSS_NOT_LOADED,
        (thresholds?.payoutReadyLossFraction ?? null) === null
            ? null
            : WITHDRAWABLE_DROP_NOT_LOADED,
    );
}
