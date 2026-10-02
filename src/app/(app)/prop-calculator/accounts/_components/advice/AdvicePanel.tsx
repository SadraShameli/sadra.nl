'use client';

import { type ComponentProps, type ReactNode, useMemo } from 'react';

import { useTodayIsoDate } from '~/app/(app)/prop-calculator/_components/useTodayIsoDate';
import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import {
    StateCardKind,
    stateCardOf,
} from '~/app/(app)/prop-calculator/accounts/_components/detail/detailState';
import {
    measuredRebuyLagOf,
    RebuyLagLineKind,
} from '~/app/(app)/prop-calculator/accounts/_components/measuredRebuyLag';
import {
    EVENT_LIST_INPUT,
    LEDGER_LIST_INPUT,
    ledgerOrDateFailure,
    OverviewSectionStatus,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { QueryErrorNotice } from '~/app/(app)/prop-calculator/accounts/_components/QueryErrorNotice';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import { Button } from '~/components/ui/Button';
import { Skeleton } from '~/components/ui/Skeleton';
import { useSession } from '~/lib/auth/client';
import {
    type AccountStage,
    firmPayoutCounts,
    isModeledAccount,
    latestTwoSnapshots,
    paidPayoutsSinceLastLiveAccountFor,
    PlanKeyResolutionKind,
    PortfolioLedger,
    resolvePlanKey,
    trackedAccountOf,
    usdCentsFromDollars,
} from '~/lib/prop-accounts';
import {
    type Plan,
    type TierProfitContext,
    type TradingPhase,
} from '~/lib/prop-calculator';
import {
    AccountAction,
    DAY_STOP_REASON_TEXT,
    type MeasuredRebuyLag,
    type ReconstructedAccount,
    ReconstructedLiveKind,
    type RiskDisplayUnit,
    type RulebookParameters,
    type SizingAdvisorCreateOptions,
} from '~/lib/prop-calculator/advisor';
import { MAX_ACCEPTED_RUNGS } from '~/lib/schemas/propAccounts';
import { api, type RouterOutputs } from '~/trpc/react';

import { ACCOUNT_ACTION_TEXT } from './accountActionModel';
import {
    AdviceValueRequestKind,
    adviceValueRequestOf,
    type AdviceValueRequestResult,
    valueRunNoteOf,
} from './adviceValueModel';
import {
    AdviceDisplayKind,
    type adviceViewModel,
    leftOutOptimumRow,
    type PersonalLimits,
} from './adviceViewModel';
import { AssumptionsList } from './AssumptionsList';
import { DailyPlanCardView } from './DailyPlanCardView';
import { DecisionLog, type DecisionSuggestion } from './DecisionLog';
import { HeadlineCard } from './HeadlineCard';
import { OptimaTable } from './OptimaTable';
import { PayoutAdviceCard } from './PayoutAdviceCard';
import { PayoutReadyBanner } from './PayoutReadyBanner';
import {
    buildSizingAdvisor,
    personalAdvisorOptionsOf,
    personalLimitsOf,
    type SizingAdvisorBuild,
    SizingAdvisorBuildKind,
} from './personalRuleOptions';
import { ProposedRiskCheck } from './ProposedRiskCheck';
import { ProvenanceLine } from './ProvenanceLine';
import { ReasonsList } from './ReasonsList';
import { RiskCheckInputKind } from './riskCheckModel';
import {
    AccountAdvicePhase,
    useAccountAdvice,
    type UseAccountAdviceInput,
} from './useAccountAdvice';
import { useAdviceViews } from './useAdviceViews';
import { useRiskCheck } from './useRiskCheck';
import { NextTradeValue, RiskCandidates, ValuesNotice } from './ValueSections';

enum BuiltKind {
    Loading = 'loading',
    NotModeled = 'not-modeled',
    Ready = 'ready',
}

enum FirmPayoutCountKind {
    Failed = 'failed',
    Pending = 'pending',
    Ready = 'ready',
}

type AccountRow = ReturnType<
    typeof trackedAccountOf<RouterOutputs['propAccounts']['account']['get']>
>;

type Built =
    | {
          readonly input: UseAccountAdviceInput;
          readonly kind: BuiltKind.Ready;
          readonly limits: PersonalLimits;
          readonly phase: null | TradingPhase;
          readonly plan: Plan;
          readonly riskUnit: RiskDisplayUnit;
          readonly snapshotId: null | string;
          readonly stage: AccountStage;
          readonly tierContext: null | TierProfitContext;
          readonly today: string;
      }
    | { readonly kind: BuiltKind.Loading }
    | { readonly kind: BuiltKind.NotModeled; readonly reason: string };

type DecisionRows = NonNullable<
    ComponentProps<typeof DecisionLog>['decisions']
>;

type EventRow =
    RouterOutputs['propAccounts']['event']['listForAccount'][number];

type FirmPayoutCountOutcome =
    | {
          readonly count: null | number;
          readonly kind: FirmPayoutCountKind.Ready;
      }
    | { readonly kind: FirmPayoutCountKind.Failed; readonly message: string }
    | { readonly kind: FirmPayoutCountKind.Pending };

interface InputQuery {
    readonly data: unknown;
    readonly error: null | { readonly message: string };
    readonly isError: boolean;
    readonly refetch: () => unknown;
}

type LedgerAccountRow =
    RouterOutputs['propAccounts']['account']['list'][number];

type LedgerEventRow = RouterOutputs['propAccounts']['event']['list'][number];

interface NamedQuery {
    readonly label: string;
    readonly query: InputQuery;
}

type PayoutRow = RouterOutputs['propAccounts']['payout']['list'][number];

type SnapshotRow =
    RouterOutputs['propAccounts']['snapshot']['listForAccount'][number];

const EMPTY_DECISIONS: DecisionRows = [];

const SUSPENDED_ACCOUNT_TEXT =
    "No sizing, daily plan, payout advice, value figures or risk check is shown for a suspended account. Set the account's status back to Active to see advice again.";

export function AdvicePanel({ id }: { readonly id: string }) {
    const session = useSession();
    const userId = session.data?.user.id;
    const accountQuery = api.propAccounts.account.get.useQuery({ id });
    const accountsListQuery =
        api.propAccounts.account.list.useQuery(ACCOUNT_LIST_INPUT);
    const snapshotsQuery = api.propAccounts.snapshot.listForAccount.useQuery({
        id,
    });
    const eventsQuery = api.propAccounts.event.listForAccount.useQuery({ id });
    const ledgerEventsQuery =
        api.propAccounts.event.list.useQuery(EVENT_LIST_INPUT);
    const payoutsQuery = api.propAccounts.payout.list.useQuery({
        accountId: id,
    });
    const ledgerPayoutsQuery =
        api.propAccounts.payout.list.useQuery(LEDGER_LIST_INPUT);
    const rulebookQuery = api.propAccounts.rulebook.get.useQuery();
    const decisionsQuery = api.propAccounts.decision.listForAccount.useQuery({
        id,
    });

    const account =
        accountQuery.data === undefined
            ? undefined
            : trackedAccountOf(accountQuery.data);

    const rebuyLagLine = useMemo(
        () =>
            measuredRebuyLagOf({
                accounts: accountsListQuery.data,
                events: ledgerEventsQuery.data,
                planSerial: account?.planSerial ?? null,
                userId,
            }),
        [
            account?.planSerial,
            accountsListQuery.data,
            ledgerEventsQuery.data,
            userId,
        ],
    );
    const measuredRebuyLag =
        rebuyLagLine?.kind === RebuyLagLineKind.Measured
            ? rebuyLagLine.value
            : null;
    const rebuyLagFailureAlert =
        rebuyLagLine?.kind === RebuyLagLineKind.Failed ? (
            <Alert variant="destructive">
                <AlertTitle>The rebuy lag could not be measured</AlertTitle>
                <AlertDescription>
                    {rebuyLagLine.message} The advice below assumes a zero-day
                    rebuy lag, which is optimistic. Fix the stored date listed
                    in the alerts on the accounts overview.
                </AlertDescription>
            </Alert>
        ) : null;

    const today = useTodayIsoDate();

    const firmPayoutCount = useMemo(
        () =>
            firmPayoutCountOf({
                accounts: accountsListQuery.data,
                events: ledgerEventsQuery.data,
                firmId: account?.firmId ?? null,
                payouts: ledgerPayoutsQuery.data,
                payoutsFailure:
                    ledgerPayoutsQuery.isError &&
                    ledgerPayoutsQuery.data === undefined
                        ? ledgerPayoutsQuery.error.message
                        : null,
                today,
                userId,
            }),
        [
            account?.firmId,
            accountsListQuery.data,
            ledgerEventsQuery.data,
            ledgerPayoutsQuery.data,
            ledgerPayoutsQuery.error,
            ledgerPayoutsQuery.isError,
            today,
            userId,
        ],
    );
    const firmCountFailureAlert =
        firmPayoutCount.kind === FirmPayoutCountKind.Failed ? (
            <Alert variant="destructive">
                <AlertTitle>
                    The firm payout count could not be loaded
                </AlertTitle>
                <AlertDescription>
                    {firmPayoutCount.message} The advice below does not check a
                    firm-wide live trigger, so a payout it shows may be one the
                    firm moves live.
                </AlertDescription>
            </Alert>
        ) : null;

    const built = useMemo(
        () =>
            userId === undefined
                ? { kind: BuiltKind.Loading as const }
                : buildAdvisorInput({
                      account,
                      events: eventsQuery.data,
                      firmPayoutCount,
                      ledgerAccounts: accountsListQuery.data,
                      ledgerEvents: ledgerEventsQuery.data,
                      measuredRebuyLag,
                      payouts: payoutsQuery.data,
                      rulebook: rulebookQuery.data,
                      snapshots: snapshotsQuery.data,
                      today,
                  }),
        [
            account,
            accountsListQuery.data,
            eventsQuery.data,
            firmPayoutCount,
            ledgerEventsQuery.data,
            measuredRebuyLag,
            payoutsQuery.data,
            rulebookQuery.data,
            snapshotsQuery.data,
            today,
            userId,
        ],
    );

    if (session.isPending) return <LoadingAdvice label="Loading the advice" />;

    if (userId === undefined) {
        return session.error === null ? (
            <Alert>
                <AlertTitle>Sign in to see the advice</AlertTitle>
                <AlertDescription>
                    Sign in to compute sizing advice for this account.
                </AlertDescription>
            </Alert>
        ) : (
            <QueryErrorNotice
                message={session.error.message}
                title="The session could not be read"
            />
        );
    }

    const failedQueries = namedInputQueries({
        accountQuery,
        accountsListQuery,
        eventsQuery,
        ledgerEventsQuery,
        payoutsQuery,
        rulebookQuery,
        snapshotsQuery,
    }).filter(({ query }) => query.isError);
    const blockingQueries = failedQueries.filter(
        ({ query }) => query.data === undefined,
    );
    const refreshFailures = failedQueries.filter(
        ({ query }) => query.data !== undefined,
    );
    if (blockingQueries.length > 0) {
        return (
            <div className="flex flex-col gap-2">
                {blockingQueries.map(({ label, query }) => (
                    <QueryErrorNotice
                        key={label}
                        message={query.error?.message ?? 'The request failed.'}
                        title={`The ${label} could not be loaded`}
                    />
                ))}
                <Button
                    className="self-start"
                    onClick={() => {
                        for (const { query } of blockingQueries) {
                            void query.refetch();
                        }
                    }}
                    variant="outline"
                >
                    Retry
                </Button>
            </div>
        );
    }
    if (accountQuery.isPending || rulebookQuery.isPending) {
        return <LoadingAdvice label="Loading the advice" />;
    }

    if (built.kind === BuiltKind.NotModeled) {
        return (
            <Alert>
                <AlertTitle>Advice is not modeled for this account</AlertTitle>
                <AlertDescription>{built.reason}</AlertDescription>
            </Alert>
        );
    }

    if (built.kind === BuiltKind.Loading) {
        return <LoadingAdvice label="Computing the advice" />;
    }

    const refreshFailureAlert =
        refreshFailures.length === 0 ? null : (
            <div className="flex flex-col gap-2">
                {refreshFailures.map(({ label, query }) => (
                    <QueryErrorNotice
                        key={label}
                        message={`${query.error?.message ?? 'The request failed.'} The advice below was computed from the last data that loaded, so its figures may not reflect your latest ${label}. Accepting a size is off until the refresh works.`}
                        title={`The ${label} could not be refreshed`}
                    />
                ))}
                <Button
                    className="self-start"
                    onClick={() => {
                        for (const { query } of refreshFailures) {
                            void query.refetch();
                        }
                    }}
                    variant="outline"
                >
                    Retry refresh
                </Button>
            </div>
        );

    return (
        <ComputedAdvice
            accountId={id}
            built={built}
            canAcceptSize={refreshFailures.length === 0}
            decisions={decisionsQuery.data}
            decisionsError={
                decisionsQuery.isError ? decisionsQuery.error.message : null
            }
            inputFailureAlerts={
                <>
                    {rebuyLagFailureAlert}
                    {firmCountFailureAlert}
                </>
            }
            refreshFailureAlert={refreshFailureAlert}
        />
    );
}

function advisorBuildOf(
    account: ReconstructedAccount,
    options: SizingAdvisorCreateOptions,
): SizingAdvisorBuild {
    try {
        return buildSizingAdvisor(account, options);
    } catch (error) {
        return {
            kind: SizingAdvisorBuildKind.NotModeled,
            reason: error instanceof Error ? error.message : String(error),
        };
    }
}

function buildAdvisorInput(args: {
    readonly account: AccountRow | undefined;
    readonly events: readonly EventRow[] | undefined;
    readonly firmPayoutCount: FirmPayoutCountOutcome;
    readonly ledgerAccounts: readonly LedgerAccountRow[] | undefined;
    readonly ledgerEvents: readonly LedgerEventRow[] | undefined;
    readonly measuredRebuyLag: MeasuredRebuyLag | null;
    readonly payouts: readonly PayoutRow[] | undefined;
    readonly rulebook: RulebookParameters | undefined;
    readonly snapshots: readonly SnapshotRow[] | undefined;
    readonly today: string;
}): Built {
    const {
        account,
        events,
        firmPayoutCount,
        ledgerAccounts,
        ledgerEvents,
        measuredRebuyLag,
        payouts,
        rulebook,
        snapshots,
        today,
    } = args;
    if (account === undefined || rulebook === undefined) {
        return { kind: BuiltKind.Loading };
    }
    if (!isModeledAccount(account)) {
        return {
            kind: BuiltKind.NotModeled,
            reason: 'This account is ledger-only, so no engine advice can be computed for it.',
        };
    }
    const resolution = resolvePlanKey(account);
    if (resolution.kind !== PlanKeyResolutionKind.Resolved) {
        return {
            kind: BuiltKind.NotModeled,
            reason: "The account's plan could not be resolved.",
        };
    }
    if (
        events === undefined ||
        snapshots === undefined ||
        payouts === undefined ||
        ledgerAccounts === undefined ||
        ledgerEvents === undefined ||
        firmPayoutCount.kind === FirmPayoutCountKind.Pending
    ) {
        return { kind: BuiltKind.Loading };
    }
    const { plan } = resolution;
    const { latest } = latestTwoSnapshots(snapshots);
    const view = stateCardOf(plan, account, latest, events, payouts, today);
    if (view.kind !== StateCardKind.Ready) {
        return {
            kind: BuiltKind.NotModeled,
            reason:
                view.kind === StateCardKind.NoSnapshot
                    ? 'Enter a balance snapshot to compute advice for this account.'
                    : view.message,
        };
    }
    const options = personalAdvisorOptionsOf({
        account: view.account,
        measuredRebuyLag,
        paidPayoutsSinceLastLiveAccount:
            firmPayoutCount.kind === FirmPayoutCountKind.Ready
                ? firmPayoutCount.count
                : null,
        personalRules: account.personalRules,
        plan,
        rulebook,
        snapshotAsOf: view.input.asOf,
        status: account.status,
        today,
    });
    const build = advisorBuildOf(view.account, options);
    if (build.kind === SizingAdvisorBuildKind.NotModeled) {
        return { kind: BuiltKind.NotModeled, reason: build.reason };
    }
    const { advisor } = build;
    const limits = personalLimitsOf(options);
    const valueRequest: AdviceValueRequestResult = adviceValueRequestOf({
        account: view.account,
        accountPolicy: options.accountPolicy,
        advice: advisor.assemble([]),
        measuredRebuyLag,
        personalCaps: limits.caps,
        personalDll: limits.dailyLossLimit,
        personalPayoutOverride: options.personalPayoutOverride,
        personalRetainedCushion: options.personalRetainedCushion,
        plan,
        rulebook,
    });
    return {
        input: {
            advisor,
            firmId: plan.id.firm,
            optIns: account.optIns,
            planSerial: account.planSerial,
            values:
                valueRequest.kind === AdviceValueRequestKind.Ready
                    ? valueRequest.request
                    : null,
            valuesUnavailableReason:
                valueRequest.kind === AdviceValueRequestKind.Failed
                    ? valueRequest.reason
                    : null,
        },
        kind: BuiltKind.Ready,
        limits,
        phase:
            view.account.kind === ReconstructedLiveKind.Live
                ? null
                : view.account.kind,
        plan,
        riskUnit: rulebook.display.riskUnit,
        snapshotId: latest?.id ?? null,
        stage: account.stage,
        tierContext:
            view.account.kind === ReconstructedLiveKind.Live
                ? null
                : plan.tierProfitContext(view.account.state),
        today,
    };
}

function ComputedAdvice({
    accountId,
    built,
    canAcceptSize,
    decisions,
    decisionsError,
    inputFailureAlerts,
    refreshFailureAlert,
}: {
    readonly accountId: string;
    readonly built: Extract<Built, { kind: BuiltKind.Ready }>;
    readonly canAcceptSize: boolean;
    readonly decisions:
        ComponentProps<typeof DecisionLog>['decisions'] | undefined;
    readonly decisionsError: null | string;
    readonly inputFailureAlerts: ReactNode;
    readonly refreshFailureAlert: ReactNode;
}) {
    const adviceState = useAccountAdvice(built.input);
    const { advisor } = built.input;
    const riskCheck = useRiskCheck({
        advisor,
        decisions: decisions ?? EMPTY_DECISIONS,
        today: built.today,
    });
    const views = useAdviceViews({
        adviceState,
        limits: built.limits,
        phase: built.phase,
        plan: built.plan,
        riskUnit: built.riskUnit,
    });

    if (adviceState.phase === AccountAdvicePhase.Loading) {
        return <LoadingAdvice label="Computing the advice" />;
    }

    if (adviceState.phase === AccountAdvicePhase.Failed) {
        return (
            <div className="flex flex-col gap-2">
                <Alert variant="destructive">
                    <AlertTitle>The advice could not be computed</AlertTitle>
                    <AlertDescription>{adviceState.reason}</AlertDescription>
                </Alert>
                <Button
                    className="self-start"
                    onClick={adviceState.retry}
                    variant="outline"
                >
                    Retry
                </Button>
            </div>
        );
    }

    if (views === null) return <LoadingAdvice label="Computing the advice" />;

    const { valueView, view } = views;

    if (advisor.isSuspended()) {
        return (
            <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold">Sizing advice</h2>
                {refreshFailureAlert}
                {inputFailureAlerts}
                <Alert variant="warning">
                    <AlertTitle>This account is suspended</AlertTitle>
                    <AlertDescription>
                        {SUSPENDED_ACCOUNT_TEXT}
                    </AlertDescription>
                </Alert>
                <ProvenanceLine provenance={view.provenance} />
            </div>
        );
    }

    if (view.kind === AdviceDisplayKind.Stale) {
        return (
            <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold">{view.headline}</h2>
                {refreshFailureAlert}
                {inputFailureAlerts}
                <Alert variant="warning">
                    <AlertTitle>{view.message}</AlertTitle>
                    <AlertDescription>
                        <ul className="list-disc pl-4">
                            {view.reasonTexts.map((text) => (
                                <li key={text}>{text}</li>
                            ))}
                        </ul>
                    </AlertDescription>
                </Alert>
                <ProvenanceLine provenance={view.provenance} />
            </div>
        );
    }

    const suggestion = canAcceptSize ? suggestionFrom(view, built) : null;
    const runNote =
        built.input.values === null || built.input.values === undefined
            ? null
            : valueRunNoteOf(built.input.values);

    const optimaRows = [
        ...view.optima,
        ...adviceState.failedOptima.map((failure) =>
            leftOutOptimumRow(failure.source, failure.reason),
        ),
    ];

    return (
        <div className="flex flex-col gap-6">
            <h2 className="text-lg font-semibold">Sizing advice</h2>
            {refreshFailureAlert}
            {inputFailureAlerts}
            <HeadlineCard view={view} />
            <p className="text-sm">
                Next action: {ACCOUNT_ACTION_TEXT[view.action]}
            </p>
            {view.action === AccountAction.RequestPayout && (
                <PayoutReadyBanner
                    flag={
                        riskCheck.flagExcess > 0
                            ? { excess: riskCheck.flagExcess }
                            : null
                    }
                    stake={valueView.stake}
                />
            )}
            <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Engine optima</h3>
                <OptimaTable rows={optimaRows} />
            </section>
            <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Reasons</h3>
                <ReasonsList reasons={view.reasons} />
            </section>
            <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Assumptions</h3>
                <AssumptionsList assumptions={view.assumptions} />
            </section>
            {view.dailyPlanCard !== null && (
                <section className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium">Today's plan</h3>
                    <DailyPlanCardView
                        card={view.dailyPlanCard}
                        sizing={
                            built.phase === null
                                ? null
                                : {
                                      phase: built.phase,
                                      plan: built.plan,
                                      tierContext: built.tierContext,
                                      unit: built.riskUnit,
                                  }
                        }
                        stopText={
                            riskCheck.stopReason === null
                                ? null
                                : DAY_STOP_REASON_TEXT[riskCheck.stopReason]
                        }
                    />
                </section>
            )}
            <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">
                    What the next trade does to value
                </h3>
                <ValuesNotice
                    isLive={built.phase === null}
                    runNote={runNote}
                    values={adviceState.values}
                >
                    <NextTradeValue valueView={valueView} />
                </ValuesNotice>
            </section>
            <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">
                    One-step risk candidates
                </h3>
                <ValuesNotice
                    isLive={built.phase === null}
                    runNote={runNote}
                    values={adviceState.values}
                >
                    <RiskCandidates valueView={valueView} />
                </ValuesNotice>
            </section>
            <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">
                    Check a risk before you place it
                </h3>
                <ProposedRiskCheck
                    accountId={accountId}
                    check={riskCheck.proposed}
                    inputMessage={
                        riskCheck.parsedRisk.kind === RiskCheckInputKind.Invalid
                            ? riskCheck.parsedRisk.message
                            : null
                    }
                    inputs={riskCheck.inputs}
                    notRunReason={
                        riskCheck.proposed === null &&
                        riskCheck.parsedRisk.kind === RiskCheckInputKind.Valid
                            ? 'The risk check could not run for this account.'
                            : null
                    }
                    occurredOn={built.today}
                    onChange={riskCheck.setInputs}
                    recorded={riskCheck.recorded}
                />
            </section>
            {view.payoutAdvice !== null && (
                <section className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium">Payout advice</h3>
                    <PayoutAdviceCard view={view.payoutAdvice} />
                    {view.payoutAdvice.personalOverrideWarningText !== null && (
                        <p className="text-sm text-destructive" role="alert">
                            {view.payoutAdvice.personalOverrideWarningText}
                        </p>
                    )}
                </section>
            )}
            <ProvenanceLine provenance={view.provenance} />
            <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Decision log</h3>
                {decisionsError !== null && (
                    <QueryErrorNotice
                        message={decisionsError}
                        title="The decision log could not be loaded"
                    />
                )}
                <DecisionLog
                    accountId={accountId}
                    decidedOn={built.today}
                    decisions={decisions ?? []}
                    suggestion={suggestion}
                />
            </section>
        </div>
    );
}

function firmPayoutCountOf(args: {
    readonly accounts: readonly LedgerAccountRow[] | undefined;
    readonly events: readonly LedgerEventRow[] | undefined;
    readonly firmId: null | string;
    readonly payouts: readonly PayoutRow[] | undefined;
    readonly payoutsFailure: null | string;
    readonly today: string;
    readonly userId: string | undefined;
}): FirmPayoutCountOutcome {
    const { accounts, events, firmId, payouts, payoutsFailure, today, userId } =
        args;
    if (payoutsFailure !== null) {
        return { kind: FirmPayoutCountKind.Failed, message: payoutsFailure };
    }
    if (
        accounts === undefined ||
        events === undefined ||
        payouts === undefined ||
        userId === undefined
    ) {
        return { kind: FirmPayoutCountKind.Pending };
    }
    if (firmId === null) {
        return { count: null, kind: FirmPayoutCountKind.Ready };
    }
    const computed = ledgerOrDateFailure(() =>
        paidPayoutsSinceLastLiveAccountFor(
            firmPayoutCounts(
                PortfolioLedger.fromRows(userId, {
                    accounts,
                    events,
                    fees: [],
                    payouts,
                }),
                today,
            ),
            firmId,
        ),
    );
    return computed.kind === OverviewSectionStatus.Ready
        ? { count: computed.value, kind: FirmPayoutCountKind.Ready }
        : { kind: FirmPayoutCountKind.Failed, message: computed.message };
}

function LoadingAdvice({ label }: { readonly label: string }) {
    return (
        <div aria-busy="true" aria-label={label}>
            <Skeleton className="h-48 w-full" />
        </div>
    );
}

function namedInputQueries(queries: {
    readonly accountQuery: InputQuery;
    readonly accountsListQuery: InputQuery;
    readonly eventsQuery: InputQuery;
    readonly ledgerEventsQuery: InputQuery;
    readonly payoutsQuery: InputQuery;
    readonly rulebookQuery: InputQuery;
    readonly snapshotsQuery: InputQuery;
}): readonly NamedQuery[] {
    return [
        { label: 'account', query: queries.accountQuery },
        { label: 'accounts list', query: queries.accountsListQuery },
        { label: 'account events', query: queries.eventsQuery },
        { label: 'ledger events', query: queries.ledgerEventsQuery },
        { label: 'payouts', query: queries.payoutsQuery },
        { label: 'rulebook', query: queries.rulebookQuery },
        { label: 'snapshots', query: queries.snapshotsQuery },
    ];
}

function suggestionFrom(
    view: ReturnType<typeof adviceViewModel>,
    built: Extract<Built, { kind: BuiltKind.Ready }>,
): DecisionSuggestion | null {
    if (view.kind !== AdviceDisplayKind.Ready || view.documented === null) {
        return null;
    }
    const headlineRisk = view.documented.rungs[0]?.risk ?? 0;
    const acceptedRungsCents = view.documented.rungs
        .map((rung) => usdCentsFromDollars(rung.risk))
        .filter((cents) => cents > 0)
        .slice(0, MAX_ACCEPTED_RUNGS);
    return {
        acceptedRiskCents: usdCentsFromDollars(headlineRisk),
        acceptedRungsCents,
        headlineRiskCents: usdCentsFromDollars(headlineRisk),
        snapshotId: built.snapshotId,
        source: view.provenance.source,
        stage: built.stage,
    };
}
