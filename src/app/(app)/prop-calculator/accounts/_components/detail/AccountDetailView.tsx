'use client';

import { Pencil, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { useTodayIsoDate } from '~/app/(app)/prop-calculator/_components/useTodayIsoDate';
import {
    ACCOUNT_LIST_INPUT,
    accountFirmLabel,
    accountPlanLabel,
    accountStatusLabel,
    readIssuesOf,
    readOnlyAccountNotice,
} from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import {
    AccountPlanIntent,
    type AccountPlanSelection,
    upgradePlanSelection,
} from '~/app/(app)/prop-calculator/accounts/_components/accountPlanOptions';
import { AccountPlanPicker } from '~/app/(app)/prop-calculator/accounts/_components/AccountPlanPicker';
import { AccountDetailSkeleton } from '~/app/(app)/prop-calculator/accounts/_components/AccountsSkeleton';
import { ArchiveAccountButton } from '~/app/(app)/prop-calculator/accounts/_components/AccountsTable';
import { reconstructedMaxRiskOf } from '~/app/(app)/prop-calculator/accounts/_components/advice/personalRuleOptions';
import { DeleteAccountDialog } from '~/app/(app)/prop-calculator/accounts/_components/DeleteAccountDialog';
import {
    measuredRebuyLagOf,
    type RebuyLagLine,
    RebuyLagLineKind,
} from '~/app/(app)/prop-calculator/accounts/_components/measuredRebuyLag';
import { AlertsCenter } from '~/app/(app)/prop-calculator/accounts/_components/overview/AlertsCenter';
import {
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
    type OverviewAlerts,
    OverviewSectionStatus,
    PortfolioSource,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import {
    ErrorNoticeTitle,
    QueryErrorNotice,
} from '~/app/(app)/prop-calculator/accounts/_components/QueryErrorNotice';
import { periodTerminated } from '~/app/(app)/prop-calculator/accounts/_components/sentenceText';
import { StoredDateFix } from '~/app/(app)/prop-calculator/accounts/_components/storedDateFix';
import { useAccountDetailValues } from '~/app/(app)/prop-calculator/accounts/_components/useAccountValues';
import { InfoNote } from '~/components/InfoNote';
import { PageHeader } from '~/components/PageHeader';
import { PanelSubheading } from '~/components/PanelSubheading';
import { deleteRowAction, rowActionsColumn } from '~/components/RowActionsMenu';
import { StatusRow, StatusTone } from '~/components/StatusRow';
import { CheckboxCard } from '~/components/ToggleCard';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { DataTable, DataTableAlign } from '~/components/ui/data-table';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { Skeleton } from '~/components/ui/skeleton';
import { errorMessage } from '~/lib/errorMessage';
import { formatDisplayDate } from '~/lib/format';
import {
    AccountStage,
    accountStageLabel,
    AccountStatus,
    AccountTracking,
    bustDiagnosisOfAttempt,
    type ExternalFirmName,
    formatUsdCents,
    isActiveAccount,
    isModeledAccount,
    latestTwoSnapshots,
    LEDGER_ONLY_LIFECYCLE_FACTS,
    type ModeledAccountRow,
    PlanKeyResolutionKind,
    resolvePlanKey,
    type SnapshotAccountRow,
    trackedAccountOf,
    type TrackedAccountRow,
    upgradeChanges,
    upgradeChangeText,
} from '~/lib/prop-accounts';
import { type Plan } from '~/lib/prop-calculator';
import {
    type MeasuredRebuyLag,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';
import {
    PropRecord,
    type PropRejection,
    propRejectionOf,
    PropStoredRecordRejection,
} from '~/lib/schemas/propAccountOutputs';
import { routes } from '~/lib/site/routes';
import { api, type RouterOutputs } from '~/trpc/react';

import { accountAlerts } from './accountAlerts';
import { BustDiagnosisCard } from './BustDiagnosisCard';
import { DetailHeaderFigures } from './DetailHeaderFigures';
import {
    DetailSection,
    type ListQuery,
    ListQueryStatus,
    RemoveRecordDialog,
} from './DetailParts';
import {
    FirmPayoutCountKind,
    type FirmPayoutCountOutcome,
    firmPayoutCountOutcomeOf,
    ledgerQueryFailureOf,
    liveAccountOf,
    liveRulesCardOf,
    performanceCardOf,
    previousReconstructionOf,
    StateCardKind,
    stateCardOf,
} from './detailState';
import { EventsSection } from './EventsSection';
import { FeesSection } from './FeesSection';
import { type FromStateDetail } from './fromStateDetail';
import { LedgerOnlySnapshotForm } from './LedgerOnlySnapshotForm';
import { LiveRulesCard } from './LiveRulesCard';
import { LiveTransitionPreviewCard } from './LiveTransitionPreviewCard';
import { NextPayoutSection } from './NextPayoutSection';
import { PayoutsSection } from './PayoutsSection';
import { PerformanceCard } from './PerformanceCard';
import { LedgerOnlyPlanSummary, PlanRulesSummary } from './PlanRulesSummary';
import { SimulateAccountLink } from './SimulateAccountLink';
import { SnapshotHistoryChart } from './SnapshotHistoryChart';
import { snapshotSeries } from './snapshotSeries';
import { StateCard } from './StateCard';
import { ViolationsSection } from './ViolationsSection';

enum AccountDetailViewColumn {
    AsOf = 'as-of',
    Balance = 'balance',
    HighestEndOfDay = 'highest-end-of-day',
    TradingDays = 'trading-days',
}

enum LagLineKind {
    Failed = 'failed',
    Measured = 'measured',
}

type AccountEventRow = RouterOutputs['propAccounts']['event']['list'][number];

type DecisionRow =
    RouterOutputs['propAccounts']['decision']['listForAccount'][number];

interface LagLine {
    readonly kind: LagLineKind;
    readonly text: string;
}

type ListedAccount = RouterOutputs['propAccounts']['account']['list'][number];

type PayoutRow = RouterOutputs['propAccounts']['payout']['list'][number];

interface ReplacementView {
    readonly lag: LagLine | null;
    readonly replacedBy: readonly ListedAccount[];
    readonly replaces: ListedAccount | null;
}

type SnapshotRow =
    RouterOutputs['propAccounts']['snapshot']['listForAccount'][number];

type StoredAccount = TrackedAccountRow<
    RouterOutputs['propAccounts']['account']['get']
>;

interface StoredRecordIssue {
    readonly message: string;
    readonly rejection: PropRejection;
}

type ViolationRow = RouterOutputs['propAccounts']['violation']['list'][number];

export function AccountDetailView({
    advice,
    id,
    userId,
}: {
    readonly advice?: ReactNode;
    readonly id: string;
    readonly userId: string;
}) {
    const accountQuery = api.propAccounts.account.get.useQuery({ id });
    const accountsQuery =
        api.propAccounts.account.list.useQuery(ACCOUNT_LIST_INPUT);
    const snapshotsQuery = api.propAccounts.snapshot.listForAccount.useQuery({
        id,
    });
    const payoutsQuery = api.propAccounts.payout.list.useQuery({
        accountId: id,
    });
    const feesQuery = api.propAccounts.fee.list.useQuery({ accountId: id });
    const eventsQuery = api.propAccounts.event.listForAccount.useQuery({ id });
    const violationsQuery = api.propAccounts.violation.list.useQuery({
        accountId: id,
    });
    const decisionsQuery = api.propAccounts.decision.listForAccount.useQuery({
        id,
    });
    const allEventsQuery =
        api.propAccounts.event.list.useQuery(EVENT_LIST_INPUT);
    const allPayoutsQuery =
        api.propAccounts.payout.list.useQuery(LEDGER_LIST_INPUT);
    const copyGroupsQuery = api.propAccounts.copyGroup.list.useQuery();
    const latestSnapshotsQuery =
        api.propAccounts.snapshot.latestTwoForAll.useQuery();
    const ledgerDecisionsQuery =
        api.propAccounts.decision.list.useQuery(LEDGER_LIST_INPUT);
    const ledgerFeesQuery =
        api.propAccounts.fee.list.useQuery(LEDGER_LIST_INPUT);
    const transfersQuery = api.propAccounts.bankroll.list.useQuery();
    const rulebookQuery = api.propAccounts.rulebook.get.useQuery();
    const externalFirmsQuery = api.propAccounts.externalFirm.list.useQuery();
    const [storedIssue, setStoredIssue] = useState<null | StoredRecordIssue>(
        null,
    );

    const reportFailure = useCallback((error: unknown) => {
        const rejection = propRejectionOf(error);
        if (
            rejection?.reason === PropStoredRecordRejection.InvalidStoredRecord
        ) {
            setStoredIssue({ message: errorMessage(error), rejection });
            return;
        }
        toast.error(errorMessage(error));
    }, []);

    const account =
        accountQuery.data === undefined
            ? undefined
            : trackedAccountOf(accountQuery.data);
    const today = useTodayIsoDate();
    const rebuyLagPlanSerial =
        account === undefined || account.tracking === AccountTracking.LedgerOnly
            ? null
            : account.planSerial;
    const rebuyLag = useMemo(
        () =>
            measuredRebuyLagOf({
                accounts: accountsQuery.data,
                events: allEventsQuery.data,
                planSerial: rebuyLagPlanSerial,
                userId,
            }),
        [accountsQuery.data, allEventsQuery.data, rebuyLagPlanSerial, userId],
    );
    const ledgerFailure = ledgerQueryFailureOf([
        {
            data: accountsQuery.data,
            error: accountsQuery.error,
            label: 'accounts list',
        },
        {
            data: allEventsQuery.data,
            error: allEventsQuery.error,
            label: 'ledger events',
        },
        {
            data: allPayoutsQuery.data,
            error: allPayoutsQuery.error,
            label: 'firm payouts',
        },
    ]);
    const firmPayoutCountAt = useCallback(
        (asOf: string) =>
            firmPayoutCountOutcomeOf({
                accounts: accountsQuery.data,
                events: allEventsQuery.data,
                failure: ledgerFailure,
                firmId: account?.firmId ?? null,
                payouts: allPayoutsQuery.data,
                today: asOf,
                userId,
            }),
        [
            account?.firmId,
            accountsQuery.data,
            allEventsQuery.data,
            allPayoutsQuery.data,
            ledgerFailure,
            userId,
        ],
    );
    const firmPayoutCount = useMemo(
        () => firmPayoutCountAt(today),
        [firmPayoutCountAt, today],
    );
    const { detail: fromStateDetail, values: accountValues } =
        useAccountDetailValues({ accountId: id, userId });
    const alerts = useMemo<OverviewAlerts>(
        () =>
            accountAlerts({
                accountId: id,
                queries: {
                    [PortfolioSource.Accounts]: {
                        data: accountsQuery.data,
                        error: accountsQuery.error,
                    },
                    [PortfolioSource.CopyGroups]: {
                        data: copyGroupsQuery.data,
                        error: copyGroupsQuery.error,
                    },
                    [PortfolioSource.Decisions]: {
                        data: ledgerDecisionsQuery.data,
                        error: ledgerDecisionsQuery.error,
                    },
                    [PortfolioSource.Events]: {
                        data: allEventsQuery.data,
                        error: allEventsQuery.error,
                    },
                    [PortfolioSource.Fees]: {
                        data: ledgerFeesQuery.data,
                        error: ledgerFeesQuery.error,
                    },
                    [PortfolioSource.Payouts]: {
                        data: allPayoutsQuery.data,
                        error: allPayoutsQuery.error,
                    },
                    [PortfolioSource.Rulebook]: {
                        data: rulebookQuery.data,
                        error: rulebookQuery.error,
                    },
                    [PortfolioSource.Snapshots]: {
                        data: latestSnapshotsQuery.data,
                        error: latestSnapshotsQuery.error,
                    },
                    [PortfolioSource.Transfers]: {
                        data: transfersQuery.data,
                        error: transfersQuery.error,
                    },
                },
                today,
            }),
        [
            accountsQuery.data,
            accountsQuery.error,
            allEventsQuery.data,
            allEventsQuery.error,
            allPayoutsQuery.data,
            allPayoutsQuery.error,
            copyGroupsQuery.data,
            copyGroupsQuery.error,
            id,
            ledgerDecisionsQuery.data,
            ledgerDecisionsQuery.error,
            latestSnapshotsQuery.data,
            latestSnapshotsQuery.error,
            ledgerFeesQuery.data,
            ledgerFeesQuery.error,
            rulebookQuery.data,
            rulebookQuery.error,
            today,
            transfersQuery.data,
            transfersQuery.error,
        ],
    );

    if (account === undefined) {
        return accountQuery.error === null ? (
            <AccountDetailSkeleton />
        ) : (
            <QueryErrorNotice
                message={accountQuery.error.message}
                title={ErrorNoticeTitle.Account}
                titleAs="h2"
            />
        );
    }

    const resolution = resolvePlanKey(account);
    const issues = readIssuesOf(account, resolution);
    const plan =
        resolution.kind === PlanKeyResolutionKind.Resolved
            ? resolution.plan
            : null;
    const isLedgerOnly = account.tracking === AccountTracking.LedgerOnly;
    const isReadOnly = (plan === null && !isLedgerOnly) || issues.length > 0;
    const externalFirms = externalFirmsQuery.data ?? [];
    const firmName = accountFirmLabel(account, externalFirms);
    const lifecycleFacts = isLedgerOnly ? LEDGER_ONLY_LIFECYCLE_FACTS : plan;

    return (
        <div className="flex flex-col gap-8">
            <AccountHeader
                account={account}
                firmName={firmName}
                isReadOnly={isReadOnly}
            />
            {accountQuery.error !== null && (
                <StatusRow
                    detail={accountQuery.error.message}
                    title="The account could not be refreshed"
                    tone={StatusTone.Warn}
                />
            )}
            {externalFirmsQuery.isError && account.externalFirmId !== null && (
                <QueryErrorNotice
                    consequence="This account shows it as an unlisted firm until your firms load."
                    message={externalFirmsQuery.error.message}
                    title={ErrorNoticeTitle.Firms}
                />
            )}
            {isReadOnly && (
                <StatusRow
                    detail={readOnlyAccountNotice(account, issues)}
                    title="This account is read-only"
                    tone={StatusTone.Warn}
                />
            )}
            {storedIssue !== null && (
                <StoredRecordNotice
                    account={account}
                    issue={storedIssue}
                    onResolved={() => {
                        setStoredIssue(null);
                    }}
                />
            )}
            {isActiveAccount(account) && (
                <DetailHeaderFigures
                    accountId={account.id}
                    values={accountValues}
                />
            )}
            <DetailSection id="rules" title="Plan rules">
                {account.tracking === AccountTracking.LedgerOnly ? (
                    <>
                        <LedgerOnlyPlanSummary
                            accountSize={account.accountSize}
                            firmName={firmName}
                            planLabel={account.planLabel}
                        />
                        {issues.length === 0 && (
                            <UpgradeToModeled
                                account={account}
                                externalFirms={externalFirms}
                            />
                        )}
                    </>
                ) : plan === null ? (
                    <p className="text-sm text-muted-foreground">
                        The plan rules cannot be shown because the stored plan
                        cannot be resolved.
                    </p>
                ) : (
                    <PlanRulesSummary
                        firmName={firmName}
                        optIns={account.optIns}
                        plan={plan}
                    />
                )}
            </DetailSection>
            {plan !== null && isModeledAccount(account) && (
                <DetailSection id="state" title="Account state">
                    <AccountStateSection
                        account={account}
                        eventsQuery={eventsQuery}
                        firmPayoutCount={firmPayoutCount}
                        firmPayoutCountAt={firmPayoutCountAt}
                        fromStateDetail={fromStateDetail}
                        measuredRebuyLag={
                            rebuyLag?.kind === RebuyLagLineKind.Measured
                                ? rebuyLag.value
                                : null
                        }
                        payoutsQuery={payoutsQuery}
                        plan={plan}
                        rulebook={rulebookQuery.data}
                        rulebookError={
                            rulebookQuery.error === null
                                ? null
                                : errorMessage(rulebookQuery.error)
                        }
                        snapshotsQuery={snapshotsQuery}
                        today={today}
                    />
                </DetailSection>
            )}
            {advice}
            <DetailSection id="alerts" title="Alerts">
                <AccountAlerts alerts={alerts} />
            </DetailSection>
            <DetailSection id="snapshots" title="Snapshot history">
                <SnapshotHistory
                    eventsQuery={eventsQuery}
                    onFailure={reportFailure}
                    query={snapshotsQuery}
                />
                {isLedgerOnly && !isReadOnly && (
                    <LedgerOnlySnapshotForm
                        accountId={account.id}
                        onFailure={reportFailure}
                    />
                )}
            </DetailSection>
            <DetailSection id="payouts" title="Payouts">
                <PayoutsSection
                    accountId={account.id}
                    canRecord={!isReadOnly}
                    onFailure={reportFailure}
                    query={payoutsQuery}
                />
            </DetailSection>
            <DetailSection id="fees" title="Fees">
                <FeesSection
                    accountId={account.id}
                    canRecord={!isReadOnly}
                    onFailure={reportFailure}
                    plan={plan}
                    query={feesQuery}
                />
            </DetailSection>
            <DetailSection id="events" title="Events">
                <EventsSection
                    accountId={account.id}
                    onFailure={reportFailure}
                    plan={isReadOnly ? null : lifecycleFacts}
                    query={eventsQuery}
                    state={account}
                    tracking={account.tracking}
                />
            </DetailSection>
            <DetailSection id="violations" title="Violations">
                <ViolationsSection
                    accountId={account.id}
                    canRecord={!isReadOnly}
                    onFailure={reportFailure}
                    query={violationsQuery}
                />
                {account.status === AccountStatus.Busted && (
                    <BustDiagnosisSubsection
                        account={account}
                        decisionsQuery={decisionsQuery}
                        eventsQuery={eventsQuery}
                        violationsQuery={violationsQuery}
                    />
                )}
            </DetailSection>
            <DetailSection id="replacement" title="Replacement chain">
                <ReplacementChain
                    account={account}
                    accountsQuery={accountsQuery}
                    eventsQuery={allEventsQuery}
                    rebuyLag={rebuyLag}
                />
            </DetailSection>
        </div>
    );
}

function AccountAlerts({ alerts }: { readonly alerts: OverviewAlerts }) {
    switch (alerts.kind) {
        case OverviewSectionStatus.Failed: {
            return <QueryErrorNotice message={alerts.message} />;
        }
        case OverviewSectionStatus.Pending: {
            return (
                <div aria-busy="true" aria-label="Loading the alerts">
                    <Skeleton className="h-16 w-full" />
                </div>
            );
        }
        case OverviewSectionStatus.Ready: {
            return (
                <>
                    {alerts.accountStatesCaveat !== null && (
                        <InfoNote>{alerts.accountStatesCaveat}</InfoNote>
                    )}
                    <AlertsCenter alerts={alerts.alerts} />
                </>
            );
        }
    }
}

function AccountHeader({
    account,
    firmName,
    isReadOnly,
}: {
    readonly account: StoredAccount;
    readonly firmName: string;
    readonly isReadOnly: boolean;
}) {
    const router = useRouter();
    return (
        <PageHeader
            actions={
                <>
                    {!isReadOnly && (
                        <Button asChild variant="outline">
                            <Link
                                href={routes.propCalculator.accounts.edit(
                                    account.id,
                                )}
                            >
                                <Pencil />
                                Edit
                            </Link>
                        </Button>
                    )}
                    <ArchiveAccountButton account={account} />
                    <DeleteAccountDialog
                        accountId={account.id}
                        label={account.label}
                        onDeleted={() => {
                            router.push(routes.propCalculator.accounts.index);
                        }}
                    />
                </>
            }
            backLink={{
                href: routes.propCalculator.accounts.index,
                label: 'All accounts',
            }}
            className="mb-0"
            lead={
                <>
                    {firmName} {accountPlanLabel(account)}
                    {account.externalAlias === null
                        ? ''
                        : `, dashboard name ${account.externalAlias}`}
                    <span className="mt-3 flex flex-wrap gap-2">
                        <Badge>{accountStageLabel(account.stage)}</Badge>
                        <Badge>{accountStatusLabel(account.status)}</Badge>
                        {account.archivedAt !== null && <Badge>Archived</Badge>}
                        {account.tracking === AccountTracking.LedgerOnly && (
                            <Badge>Ledger only</Badge>
                        )}
                        {account.tags.map((tag) => (
                            <Badge key={tag}>{tag}</Badge>
                        ))}
                    </span>
                </>
            }
            title={account.label}
        />
    );
}

function AccountStateQueryErrors({
    eventsQuery,
    payoutsQuery,
    snapshotsQuery,
}: {
    readonly eventsQuery: ListQuery<AccountEventRow>;
    readonly payoutsQuery: ListQuery<PayoutRow>;
    readonly snapshotsQuery: ListQuery<SnapshotRow>;
}) {
    return (
        <div className="flex flex-col gap-4">
            <ListQueryStatus query={eventsQuery} subject="account events" />
            <ListQueryStatus query={payoutsQuery} subject="payouts" />
            <ListQueryStatus query={snapshotsQuery} subject="balances" />
        </div>
    );
}

function AccountStateSection({
    account,
    eventsQuery,
    firmPayoutCount,
    firmPayoutCountAt,
    fromStateDetail,
    measuredRebuyLag,
    payoutsQuery,
    plan,
    rulebook,
    rulebookError,
    snapshotsQuery,
    today,
}: {
    readonly account: ModeledAccountRow<SnapshotAccountRow>;
    readonly eventsQuery: ListQuery<AccountEventRow>;
    readonly firmPayoutCount: FirmPayoutCountOutcome;
    readonly firmPayoutCountAt: (asOf: string) => FirmPayoutCountOutcome;
    readonly fromStateDetail: FromStateDetail;
    readonly measuredRebuyLag: MeasuredRebuyLag | null;
    readonly payoutsQuery: ListQuery<PayoutRow>;
    readonly plan: Plan;
    readonly rulebook: RulebookParameters | undefined;
    readonly rulebookError: null | string;
    readonly snapshotsQuery: ListQuery<SnapshotRow>;
    readonly today: string;
}) {
    const events = eventsQuery.data;
    const payouts = payoutsQuery.data;
    const snapshots = snapshotsQuery.data;
    const view = useMemo(() => {
        if (
            events === undefined ||
            payouts === undefined ||
            snapshots === undefined ||
            rulebook === undefined ||
            firmPayoutCount.kind !== FirmPayoutCountKind.Ready
        ) {
            return null;
        }
        const { latest, previous } = latestTwoSnapshots(snapshots);
        const state = stateCardOf(
            plan,
            account,
            latest,
            events,
            payouts,
            today,
            firmPayoutCount.count,
            rulebook.live.cushionPercent,
        );
        const previousCount =
            previous === null ? null : firmPayoutCountAt(previous.asOf);
        const previousReconstruction =
            previous === null ||
            previousCount?.kind !== FirmPayoutCountKind.Ready
                ? null
                : previousReconstructionOf(
                      plan,
                      account,
                      previous,
                      events,
                      payouts,
                      previous.asOf,
                      previousCount.count,
                      rulebook.live.cushionPercent,
                  );
        const liveRules = liveRulesCardOf(plan, liveAccountOf(state));
        const performance =
            state.kind === StateCardKind.Ready
                ? performanceCardOf(
                      {
                          account: state.account,
                          asOf: state.asOf,
                          input: state.input,
                      },
                      previousReconstruction,
                      events,
                      payouts,
                  )
                : null;
        return { liveRules, performance, state };
    }, [
        account,
        events,
        firmPayoutCount,
        firmPayoutCountAt,
        payouts,
        plan,
        rulebook,
        snapshots,
        today,
    ]);

    const hasQueryError =
        eventsQuery.error !== null ||
        payoutsQuery.error !== null ||
        snapshotsQuery.error !== null;
    const queryErrors = hasQueryError && (
        <AccountStateQueryErrors
            eventsQuery={eventsQuery}
            payoutsQuery={payoutsQuery}
            snapshotsQuery={snapshotsQuery}
        />
    );

    const firmCountFailure = firmPayoutCount.kind ===
        FirmPayoutCountKind.Failed && (
        <QueryErrorNotice
            consequence="The account state is not shown, because it counts the payouts the whole firm has paid or requested toward a firm-wide live trigger."
            message={firmPayoutCount.message}
            title={ErrorNoticeTitle.FirmPayoutCount}
        />
    );

    const rulebookFailure = rulebook === undefined &&
        rulebookError !== null && (
            <QueryErrorNotice
                consequence="The account state is not shown, because a live account is sized from your rulebook's live cushion percent."
                message={rulebookError}
                title={ErrorNoticeTitle.Rulebook}
            />
        );

    if (view === null) {
        return hasQueryError || firmCountFailure || rulebookFailure ? (
            <>
                {queryErrors}
                {firmCountFailure}
                {rulebookFailure}
            </>
        ) : (
            <div
                aria-busy="true"
                aria-label="Loading the account state"
                role="status"
            >
                <Skeleton className="h-24 w-full" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            {queryErrors}
            <StateCard view={view.state} />
            {view.performance !== null && (
                <div className="flex flex-col gap-2">
                    <PanelSubheading>Performance</PanelSubheading>
                    <PerformanceCard view={view.performance} />
                </div>
            )}
            {account.stage === AccountStage.Live && (
                <div className="flex flex-col gap-2">
                    <PanelSubheading>Live rules</PanelSubheading>
                    <LiveRulesCard view={view.liveRules} />
                </div>
            )}
            {view.state.kind === StateCardKind.Ready && (
                <>
                    <div className="flex flex-col gap-2">
                        <PanelSubheading>
                            Value and next payout from this state
                        </PanelSubheading>
                        <NextPayoutSection
                            account={view.state.account}
                            detail={fromStateDetail}
                            input={view.state.input}
                            rulebook={rulebook}
                            rulebookError={rulebookError}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <PanelSubheading>
                            Live transition preview
                        </PanelSubheading>
                        <LiveTransitionPreviewCard
                            account={view.state.account}
                            plan={plan}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <PanelSubheading>Simulate this account</PanelSubheading>
                        <SimulateAccountLink
                            measuredRebuyLag={measuredRebuyLag}
                            personalMaxRiskPerTrade={reconstructedMaxRiskOf(
                                view.state.account,
                            )}
                            plan={plan}
                            rulebook={rulebook}
                            rulebookError={rulebookError}
                            stage={view.state.input.stage}
                        />
                    </div>
                </>
            )}
        </div>
    );
}

function BustDiagnosisSubsection({
    account,
    decisionsQuery,
    eventsQuery,
    violationsQuery,
}: {
    readonly account: Pick<StoredAccount, 'purchasedOn'>;
    readonly decisionsQuery: ListQuery<DecisionRow>;
    readonly eventsQuery: ListQuery<AccountEventRow>;
    readonly violationsQuery: ListQuery<ViolationRow>;
}) {
    const diagnosis = bustDiagnosisOfAttempt(
        { events: eventsQuery.data ?? [], purchasedOn: account.purchasedOn },
        decisionsQuery.data ?? [],
        violationsQuery.data ?? [],
    );
    if (diagnosis === null) return null;
    return (
        <div className="flex flex-col gap-2">
            <PanelSubheading>Bust diagnosis</PanelSubheading>
            <BustDiagnosisCard diagnosis={diagnosis} />
        </div>
    );
}

function lagLineOf(line: null | RebuyLagLine): LagLine | null {
    if (line === null) return null;
    return line.kind === RebuyLagLineKind.Failed
        ? {
              kind: LagLineKind.Failed,
              text: `${ErrorNoticeTitle.RebuyLag}: ${periodTerminated(line.message)} ${StoredDateFix.OnOverview}`,
          }
        : {
              kind: LagLineKind.Measured,
              text: `Measured rebuy lag on this plan: ${line.value.days.toFixed(1)} sessions (n = ${String(line.value.samples)})`,
          };
}

function ReplacementChain({
    account,
    accountsQuery,
    eventsQuery,
    rebuyLag,
}: {
    readonly account: StoredAccount;
    readonly accountsQuery: ListQuery<ListedAccount>;
    readonly eventsQuery: ListQuery<AccountEventRow>;
    readonly rebuyLag: null | RebuyLagLine;
}) {
    const accounts = accountsQuery.data;
    const events = eventsQuery.data;
    const view = useMemo<null | ReplacementView>(
        () =>
            accounts === undefined || events === undefined
                ? null
                : {
                      lag: lagLineOf(rebuyLag),
                      replacedBy: accounts.filter(
                          (candidate) =>
                              candidate.replacesAccountId === account.id,
                      ),
                      replaces:
                          accounts.find(
                              (candidate) =>
                                  candidate.id === account.replacesAccountId,
                          ) ?? null,
                  },
        [account, accounts, events, rebuyLag],
    );
    return (
        <>
            <ListQueryStatus query={accountsQuery} subject="accounts" />
            <ListQueryStatus query={eventsQuery} subject="account events" />
            {view !== null &&
                view.replaces === null &&
                account.replacesAccountId === null &&
                view.replacedBy.length === 0 &&
                view.lag === null && (
                    <EmptyState
                        icon={RefreshCw}
                        size={EmptyStateSize.Compact}
                        title="Not part of a replacement chain"
                    />
                )}
            {view !== null && (
                <div className="flex flex-col gap-2 text-sm">
                    {view.replaces === null ? (
                        account.replacesAccountId !== null && (
                            <p className="text-muted-foreground">
                                This account replaces an account that no longer
                                exists.
                            </p>
                        )
                    ) : (
                        <p>
                            Replaces{' '}
                            <Link
                                className="font-medium underline underline-offset-4"
                                href={routes.propCalculator.accounts.detail(
                                    view.replaces.id,
                                )}
                            >
                                {view.replaces.label}
                            </Link>
                        </p>
                    )}
                    {view.replacedBy.length > 0 && (
                        <p>
                            Replaced by{' '}
                            {view.replacedBy.map((replacement, index) => (
                                <span key={replacement.id}>
                                    {index > 0 && ', '}
                                    <Link
                                        className="font-medium underline underline-offset-4"
                                        href={routes.propCalculator.accounts.detail(
                                            replacement.id,
                                        )}
                                    >
                                        {replacement.label}
                                    </Link>
                                </span>
                            ))}
                        </p>
                    )}
                    {view.lag !== null &&
                        (view.lag.kind === LagLineKind.Failed ? (
                            <QueryErrorNotice message={view.lag.text} />
                        ) : (
                            <p className="text-muted-foreground">
                                {view.lag.text}
                            </p>
                        ))}
                </div>
            )}
        </>
    );
}

function SnapshotHistory({
    eventsQuery,
    onFailure,
    query,
}: {
    readonly eventsQuery: ListQuery<AccountEventRow>;
    readonly onFailure: (error: unknown) => void;
    readonly query: ListQuery<SnapshotRow>;
}) {
    const utilities = api.useUtils();
    const remove = api.propAccounts.snapshot.remove.useMutation({
        onError: onFailure,
        onSuccess: () => {
            toast.success('Snapshot deleted');
            return utilities.propAccounts.invalidate();
        },
    });
    const rows = query.data;
    const events = eventsQuery.data;
    const series = useMemo(
        () => snapshotSeries(rows ?? [], events ?? []),
        [rows, events],
    );
    const [latest] = rows ?? [];
    return (
        <>
            <ListQueryStatus query={query} subject="balances" />
            {rows !== undefined && (
                <>
                    {latest !== undefined && (
                        <p className="text-sm">
                            Latest balance{' '}
                            <span className="font-medium tabular-nums">
                                {formatUsdCents(latest.balanceCents)}
                            </span>{' '}
                            as of {formatDisplayDate(latest.asOf)}
                            {latest.highestEodBalanceCents !== null &&
                                `, highest end-of-day balance ${formatUsdCents(latest.highestEodBalanceCents)}`}
                            {latest.tradingDays !== null &&
                                `, ${String(latest.tradingDays)} trading days`}
                        </p>
                    )}
                    <SnapshotHistoryChart series={series} />
                    {rows.length > 0 && (
                        <DataTable
                            columns={[
                                {
                                    cell: ({ row: { original: row } }) => (
                                        <div className="tabular-nums">
                                            {formatDisplayDate(row.asOf)}
                                        </div>
                                    ),
                                    header: 'As of',
                                    id: AccountDetailViewColumn.AsOf,
                                    meta: { isRowHeader: true },
                                },
                                {
                                    cell: ({ row: { original: row } }) => (
                                        <>{formatUsdCents(row.balanceCents)}</>
                                    ),
                                    header: 'Balance',
                                    id: AccountDetailViewColumn.Balance,
                                    meta: { align: DataTableAlign.End },
                                },
                                {
                                    cell: ({ row: { original: row } }) => (
                                        <>
                                            {row.highestEodBalanceCents === null
                                                ? ''
                                                : formatUsdCents(
                                                      row.highestEodBalanceCents,
                                                  )}
                                        </>
                                    ),
                                    header: 'Highest end of day',
                                    id: AccountDetailViewColumn.HighestEndOfDay,
                                    meta: { align: DataTableAlign.End },
                                },
                                {
                                    cell: ({ row: { original: row } }) => (
                                        <>{row.tradingDays ?? ''}</>
                                    ),
                                    header: 'Trading days',
                                    id: AccountDetailViewColumn.TradingDays,
                                    meta: { align: DataTableAlign.End },
                                },
                                rowActionsColumn<SnapshotRow>({
                                    actionsOf: (row) => [
                                        deleteRowAction({
                                            description:
                                                'This permanently removes the balance snapshot.',
                                            onDelete: () => {
                                                remove.mutate({ id: row.id });
                                            },
                                            title: 'Delete this snapshot?',
                                        }),
                                    ],
                                    isPendingOf: (row) =>
                                        remove.isPending &&
                                        remove.variables.id === row.id,
                                    labelOf: (row) =>
                                        `the snapshot of ${formatDisplayDate(row.asOf)}`,
                                }),
                            ]}
                            data={[...rows]}
                            isSortable={false}
                            pageSize={null}
                            rowId={(row) => row.id}
                        />
                    )}
                </>
            )}
        </>
    );
}

function StoredRecordActions({
    account,
    onResolved,
    rejection,
}: {
    readonly account: StoredAccount;
    readonly onResolved: () => void;
    readonly rejection: PropRejection;
}) {
    const router = useRouter();
    const utilities = api.useUtils();
    const removed = {
        onError: (error: { readonly message: string }) => {
            toast.error(error.message);
        },
        onSuccess: () => {
            onResolved();
            return utilities.propAccounts.invalidate();
        },
    };
    const payoutRemoval = api.propAccounts.payout.remove.useMutation(removed);
    const feeRemoval = api.propAccounts.fee.remove.useMutation(removed);
    const snapshotRemoval =
        api.propAccounts.snapshot.remove.useMutation(removed);
    const { record, recordId } = rejection;
    if (record === null || recordId === null) return null;
    switch (record) {
        case PropRecord.Account: {
            return recordId === account.id ? (
                <div className="mt-2 flex items-center gap-1">
                    <ArchiveAccountButton account={account} />
                    <DeleteAccountDialog
                        accountId={account.id}
                        label={account.label}
                        onDeleted={() => {
                            router.push(routes.propCalculator.accounts.index);
                        }}
                    />
                </div>
            ) : null;
        }
        case PropRecord.BankrollTransfer:
        case PropRecord.CopyGroup:
        case PropRecord.Decision:
        case PropRecord.Event:
        case PropRecord.ExternalFirm:
        case PropRecord.FirmEngagement:
        case PropRecord.FirmStatement:
        case PropRecord.Round:
        case PropRecord.Rulebook:
        case PropRecord.Scenario:
        case PropRecord.Violation: {
            return null;
        }
        case PropRecord.Fee: {
            return (
                <StoredRecordRemoval
                    isPending={feeRemoval.isPending}
                    onConfirm={() => {
                        feeRemoval.mutate({ id: recordId });
                    }}
                    record={record}
                />
            );
        }
        case PropRecord.Payout: {
            return (
                <StoredRecordRemoval
                    isPending={payoutRemoval.isPending}
                    onConfirm={() => {
                        payoutRemoval.mutate({ id: recordId });
                    }}
                    record={record}
                />
            );
        }
        case PropRecord.Snapshot: {
            return (
                <StoredRecordRemoval
                    isPending={snapshotRemoval.isPending}
                    onConfirm={() => {
                        snapshotRemoval.mutate({ id: recordId });
                    }}
                    record={record}
                />
            );
        }
    }
}

function StoredRecordNotice({
    account,
    issue,
    onResolved,
}: {
    readonly account: StoredAccount;
    readonly issue: StoredRecordIssue;
    readonly onResolved: () => void;
}) {
    return (
        <QueryErrorNotice
            actions={
                <StoredRecordActions
                    account={account}
                    onResolved={onResolved}
                    rejection={issue.rejection}
                />
            }
            message={issue.message}
            title="A stored record needs your attention"
        />
    );
}

function StoredRecordRemoval({
    isPending,
    onConfirm,
    record,
}: {
    readonly isPending: boolean;
    readonly onConfirm: () => void;
    readonly record: PropRecord;
}) {
    return (
        <div className="mt-2">
            <RemoveRecordDialog
                confirmText="Remove"
                description={`This permanently removes the stored ${record} so you can enter it again.`}
                isPending={isPending}
                onConfirm={onConfirm}
                title={`Remove this ${record}?`}
                triggerLabel={`Remove the ${record}`}
            />
        </div>
    );
}

function UpgradeToModeled({
    account,
    externalFirms,
}: {
    readonly account: StoredAccount;
    readonly externalFirms: readonly ExternalFirmName[];
}) {
    const utilities = api.useUtils();
    const upgrade = api.propAccounts.account.upgradeToModeled.useMutation();
    const [selection, setSelection] = useState<AccountPlanSelection>(() =>
        upgradePlanSelection(
            account.firmId,
            account.accountSize,
            AccountPlanIntent.ExistingAccount,
        ),
    );
    const [isConfirmed, setConfirmed] = useState(false);
    const changes = upgradeChanges(account, selection).map(
        (change) => `This changes ${upgradeChangeText(change, externalFirms)}.`,
    );
    const requiresConfirmation = changes.length > 0;
    const changesId = 'account-upgrade-changes';
    const submit = async () => {
        try {
            await upgrade.mutateAsync({
                ...selection,
                confirmSizeOrFirmChange: requiresConfirmation,
                id: account.id,
            });
            toast.success(`${account.label} now follows a modeled plan`);
            await utilities.propAccounts.invalidate();
        } catch (error) {
            toast.error(errorMessage(error));
        }
    };
    return (
        <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(event) => {
                event.preventDefault();
                void submit();
            }}
        >
            <PanelSubheading>Upgrade to a modeled plan</PanelSubheading>
            <p className="text-sm text-muted-foreground">
                Once its firm and size are modeled, pick the plan. The account
                keeps its fees, payouts and events, its plan name is replaced by
                the plan, and its stage must be one the plan offers.
            </p>
            <AccountPlanPicker
                errors={[]}
                intent={AccountPlanIntent.ExistingAccount}
                onChange={(next) => {
                    setSelection(next);
                    setConfirmed(false);
                }}
                value={selection}
            />
            <div
                className="flex flex-col gap-2 text-sm"
                id={changesId}
                role="status"
            >
                {changes.map((change) => (
                    <p key={change}>{change}</p>
                ))}
            </div>
            {requiresConfirmation && (
                <CheckboxCard
                    aria-describedby={changesId}
                    checked={isConfirmed}
                    id="account-upgrade-confirm"
                    label="I confirm this change"
                    onCheckedChange={setConfirmed}
                />
            )}
            <Button
                aria-describedby={requiresConfirmation ? changesId : undefined}
                className="self-start"
                disabled={
                    upgrade.isPending || (requiresConfirmation && !isConfirmed)
                }
                id="account-upgrade"
                type="submit"
                variant="outline"
            >
                Upgrade
            </Button>
        </form>
    );
}
