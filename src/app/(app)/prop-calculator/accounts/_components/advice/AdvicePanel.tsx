'use client';

import { type ComponentProps, type ReactNode, useMemo, useState } from 'react';

import { useTodayIsoDate } from '~/app/(app)/prop-calculator/_components/useTodayIsoDate';
import { ACCOUNT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { StateCardKind, stateCardOf } from '~/app/(app)/prop-calculator/accounts/_components/detail/detailState';
import { measuredRebuyLagOf, RebuyLagLineKind } from '~/app/(app)/prop-calculator/accounts/_components/measuredRebuyLag';
import { EVENT_LIST_INPUT } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { QueryErrorNotice } from '~/app/(app)/prop-calculator/accounts/_components/QueryErrorNotice';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import { Button } from '~/components/ui/Button';
import { Skeleton } from '~/components/ui/Skeleton';
import { useSession } from '~/lib/auth/client';
import {
    type AccountStage,
    isModeledAccount,
    latestTwoSnapshots,
    PlanKeyResolutionKind,
    readPersonalRulesOrNull,
    resolvePlanKey,
    trackedAccountOf,
    type UsdCents,
    usdCentsFromDollars,
    usdCentsToDollars,
} from '~/lib/prop-accounts';
import { findFirm, type Plan, TradingPhase } from '~/lib/prop-calculator';
import {
    AccountAction,
    createSizingAdvisor,
    DAY_STOP_REASON_TEXT,
    type DocumentedRung,
    type MeasuredRebuyLag,
    type PersonalCaps,
    ReconstructedLiveKind,
    type RiskDisplayUnit,
    type RulebookParameters,
    type SizingAdvisor,
} from '~/lib/prop-calculator/advisor';
import { dollars } from '~/lib/prop-calculator/core';
import { MAX_ACCEPTED_RUNGS } from '~/lib/schemas/propAccounts';
import { api, type RouterOutputs } from '~/trpc/react';

import {
    ACCOUNT_ACTION_TEXT,
    adviceValueRequestOf,
    type AdviceValueView,
    adviceValueViewOf,
    adviceWithValues,
    dayProgressOf,
    dayStopReasonOf,
    EMPTY_RISK_CHECK_INPUTS,
    NO_LIVE_VALUE_TEXT,
    parseDayCounts,
    parseRiskCheckInputs,
    RiskCheckInputKind,
    type RiskCheckInputs,
    type RiskCheckView,
    riskCheckViewOf,
    todaysDecisionsOf,
    ValueSectionKind,
} from './adviceValueModel';
import { AdviceDisplayKind, adviceViewModel, leftOutOptimumRow } from './adviceViewModel';
import { AssumptionsList } from './AssumptionsList';
import { DailyPlanCardView } from './DailyPlanCardView';
import { DecisionLog, type DecisionSuggestion } from './DecisionLog';
import { EvSwingRow } from './EvSwingRow';
import { HeadlineCard } from './HeadlineCard';
import { OneStepTree } from './OneStepTree';
import { OptimaTable } from './OptimaTable';
import { PayoutAdviceCard } from './PayoutAdviceCard';
import { PayoutReadyBanner } from './PayoutReadyBanner';
import { ProposedRiskCheck } from './ProposedRiskCheck';
import { ProvenanceLine } from './ProvenanceLine';
import { ReasonsList } from './ReasonsList';
import { RiskCandidatesTable } from './RiskCandidatesTable';
import {
    AccountAdvicePhase,
    AdviceValuesPhase,
    type AdviceValuesState,
    useAccountAdvice,
    type UseAccountAdviceInput,
} from './useAccountAdvice';

enum BuiltKind {
    Loading = 'loading',
    NotModeled = 'not-modeled',
    Ready = 'ready',
}

type AccountRow = ReturnType<typeof trackedAccountOf<RouterOutputs['propAccounts']['account']['get']>>;

type Built =
    | {
          readonly input: UseAccountAdviceInput;
          readonly kind: BuiltKind.Ready;
          readonly phase: null | TradingPhase;
          readonly plan: Plan;
          readonly riskUnit: RiskDisplayUnit;
          readonly snapshotId: null | string;
          readonly stage: AccountStage;
          readonly today: string;
      }
    | { readonly kind: BuiltKind.Loading }
    | { readonly kind: BuiltKind.NotModeled; readonly reason: string };

type EventRow = RouterOutputs['propAccounts']['event']['listForAccount'][number];

interface InputQuery {
    readonly data: unknown;
    readonly error: null | { readonly message: string };
    readonly isError: boolean;
    readonly refetch: () => unknown;
}

type LedgerAccountRow = RouterOutputs['propAccounts']['account']['list'][number];

type LedgerEventRow = RouterOutputs['propAccounts']['event']['list'][number];

interface NamedQuery {
    readonly label: string;
    readonly query: InputQuery;
}

type PayoutRow = RouterOutputs['propAccounts']['payout']['list'][number];

type SnapshotRow = RouterOutputs['propAccounts']['snapshot']['listForAccount'][number];

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
        [account?.planSerial, accountsListQuery.data, ledgerEventsQuery.data, userId],
    );
    const measuredRebuyLag =
        rebuyLagLine?.kind === RebuyLagLineKind.Measured ? rebuyLagLine.value : null;
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

    const built = useMemo(
        () =>
            userId === undefined
                ? { kind: BuiltKind.Loading as const }
                : buildAdvisorInput({
                      account,
                      events: eventsQuery.data,
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
                decisionsQuery.isError
                    ? decisionsQuery.error.message
                    : null
            }
            rebuyLagFailureAlert={rebuyLagFailureAlert}
            refreshFailureAlert={refreshFailureAlert}
        />
    );
}

function buildAdvisorInput(args: {
    readonly account: AccountRow | undefined;
    readonly events: readonly EventRow[] | undefined;
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
        ledgerEvents === undefined
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
    const personalRules = readPersonalRulesOrNull(account.personalRules);
    const personalCaps: PersonalCaps = {
        dailyProfitCap: optionalDollars(personalRules?.dailyProfitCapCents),
        maxRiskPerTrade:
            view.account.kind === ReconstructedLiveKind.Live ||
            view.account.personalMaxRiskPerTrade == null
                ? null
                : dollars(view.account.personalMaxRiskPerTrade),
        maxTradesPerDay: personalRules?.maxTradesPerDay ?? null,
    };
    const accountPolicy = findFirm(plan.id.firm)?.accountPolicy;
    let advisor: SizingAdvisor;
    try {
        advisor = createSizingAdvisor(view.account, {
            accountPolicy,
            measuredRebuyLag,
            personalCaps,
            personalDll: optionalDollars(personalRules?.dailyLossLimitCents),
            personalPayoutOverride: optionalDollars(
                personalRules?.payoutRequestOverrideCents,
            ),
            personalRetainedCushion: optionalDollars(
                personalRules?.retainedCushionCents,
            ),
            rulebook,
            snapshotAsOf: view.input.asOf,
            today,
        });
    } catch (error) {
        return {
            kind: BuiltKind.NotModeled,
            reason: error instanceof Error ? error.message : String(error),
        };
    }
    return {
        input: {
            advisor,
            firmId: plan.id.firm,
            optIns: account.optIns,
            planSerial: account.planSerial,
            values: adviceValueRequestOf({
                account: view.account,
                accountPolicy,
                advice: advisor.assemble([]),
                measuredRebuyLag,
                plan,
                rulebook,
            }),
        },
        kind: BuiltKind.Ready,
        phase: view.account.kind === ReconstructedLiveKind.Live ? null : view.account.kind,
        plan,
        riskUnit: rulebook.display.riskUnit,
        snapshotId: latest?.id ?? null,
        stage: account.stage,
        today,
    };
}

function ComputedAdvice({
    accountId,
    built,
    canAcceptSize,
    decisions,
    decisionsError,
    rebuyLagFailureAlert,
    refreshFailureAlert,
}: {
    readonly accountId: string;
    readonly built: Extract<Built, { kind: BuiltKind.Ready }>;
    readonly canAcceptSize: boolean;
    readonly decisions: ComponentProps<typeof DecisionLog>['decisions'] | undefined;
    readonly decisionsError: null | string;
    readonly rebuyLagFailureAlert: ReactNode;
    readonly refreshFailureAlert: ReactNode;
}) {
    const adviceState = useAccountAdvice(built.input);
    const [riskInputs, setRiskInputs] = useState<RiskCheckInputs>(
        EMPTY_RISK_CHECK_INPUTS,
    );

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

    const { advisor } = built.input;
    const rungs = adviceState.advice.dailyPlanCard?.rungs ?? [];
    const valueView = adviceValueViewOf({
        context: {
            phase: built.phase ?? TradingPhase.Funded,
            plan: built.plan,
            unit: built.riskUnit,
        },
        documentedRisk: rungs[0]?.risk ?? null,
        outcome:
            adviceState.values.phase === AdviceValuesPhase.Ready
                ? adviceState.values.result
                : null,
    });
    const view = adviceViewModel(adviceWithValues(adviceState.advice, valueView));

    if (view.kind === AdviceDisplayKind.Stale) {
        return (
            <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold">{view.headline}</h2>
                {refreshFailureAlert}
                {rebuyLagFailureAlert}
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

    const dayCounts = parseDayCounts(riskInputs);
    const stopReason =
        dayCounts === null || dayCounts.wins + dayCounts.losses === 0
            ? null
            : dayStopReasonOf(advisor, rungs, dayCounts.wins, dayCounts.losses);
    const parsedRisk = parseRiskCheckInputs(riskInputs);
    const proposedResult =
        parsedRisk.kind === RiskCheckInputKind.Valid
            ? advisor.checkNextTradeRisk(
                  parsedRisk.risk,
                  dayProgressOf(rungs, parsedRisk.wins, parsedRisk.losses),
              )
            : null;
    const proposedCheck: null | RiskCheckView =
        proposedResult !== null && parsedRisk.kind === RiskCheckInputKind.Valid
            ? riskCheckViewOf(proposedResult, parsedRisk.losses)
            : null;
    const { latest, recorded } = todaysDecisionsOf(decisions ?? [], built.today);
    const recordedCheck = recordedCheckOf(
        advisor,
        rungs,
        recorded?.actualRiskCents ?? null,
        dayCounts,
    );
    const flagExcess = Math.max(
        payoutFlagExcessOf(proposedCheck),
        payoutFlagExcessOf(recordedCheck?.view ?? null),
    );

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
            {rebuyLagFailureAlert}
            <HeadlineCard view={view} />
            <p className="text-sm">Next action: {ACCOUNT_ACTION_TEXT[view.action]}</p>
            {view.action === AccountAction.RequestPayout && (
                <PayoutReadyBanner
                    flag={flagExcess > 0 ? { excess: flagExcess } : null}
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
                                      unit: built.riskUnit,
                                  }
                        }
                        stopText={
                            stopReason === null
                                ? null
                                : DAY_STOP_REASON_TEXT[stopReason]
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
                    values={adviceState.values}
                >
                    <NextTradeValue valueView={valueView} />
                </ValuesNotice>
            </section>
            <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Ranked risk candidates</h3>
                <ValuesNotice
                    isLive={built.phase === null}
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
                    check={proposedCheck}
                    decisionId={latest?.id ?? null}
                    inputMessage={
                        parsedRisk.kind === RiskCheckInputKind.Invalid
                            ? parsedRisk.message
                            : null
                    }
                    inputs={riskInputs}
                    notRunReason={
                        proposedCheck === null &&
                        parsedRisk.kind === RiskCheckInputKind.Valid
                            ? 'The risk check could not run for this account.'
                            : null
                    }
                    occurredOn={built.today}
                    onChange={setRiskInputs}
                    recorded={recordedCheck}
                />
            </section>
            {view.payoutAdvice !== null && (
                <section className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium">Payout advice</h3>
                    <PayoutAdviceCard view={view.payoutAdvice} />
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

function NextTradeValue({ valueView }: { readonly valueView: AdviceValueView }) {
    if (valueView.swings.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No trade is placeable today, so there is no next trade to value.
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-3">
            <ul className="flex list-none flex-col gap-1">
                {valueView.swings.map((swing) => (
                    <EvSwingRow
                        key={
                            swing.kind === ValueSectionKind.Ready
                                ? swing.row.index
                                : swing.index
                        }
                        view={swing}
                    />
                ))}
            </ul>
            {valueView.tree !== null && <OneStepTree tree={valueView.tree} />}
        </div>
    );
}

function optionalDollars(cents: undefined | UsdCents) {
    return cents === undefined ? null : usdCentsToDollars(cents);
}

function payoutFlagExcessOf(check: null | RiskCheckView): number {
    return check?.payoutEligibleAboveRung === true ? check.excess : 0;
}

function recordedCheckOf(
    advisor: SizingAdvisor,
    rungs: readonly DocumentedRung[],
    actualRiskCents: null | UsdCents,
    dayCounts: null | { readonly losses: number; readonly wins: number },
): null | { readonly risk: number; readonly view: RiskCheckView } {
    if (actualRiskCents === null) return null;
    const risk = usdCentsToDollars(actualRiskCents);
    const counts = dayCounts ?? { losses: 0, wins: 0 };
    const result = advisor.checkNextTradeRisk(
        risk,
        dayProgressOf(rungs, counts.wins, counts.losses),
    );
    return result === null
        ? null
        : { risk, view: riskCheckViewOf(result, counts.losses) };
}

function RiskCandidates({ valueView }: { readonly valueView: AdviceValueView }) {
    const { candidates } = valueView;
    if (candidates === null) {
        return (
            <p className="text-sm text-muted-foreground">
                No risk candidates were computed.
            </p>
        );
    }
    switch (candidates.kind) {
        case ValueSectionKind.Failed: {
            return (
                <p className="text-sm text-muted-foreground">
                    Left out: {candidates.reason}
                </p>
            );
        }
        case ValueSectionKind.NotModeled: {
            return (
                <p className="text-sm text-muted-foreground">
                    Risk candidates are not modeled for this account.
                </p>
            );
        }
        case ValueSectionKind.Ready: {
            return <RiskCandidatesTable view={candidates.view} />;
        }
    }
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

function ValuesNotice({
    children,
    isLive,
    values,
}: {
    readonly children: ReactNode;
    readonly isLive: boolean;
    readonly values: AdviceValuesState;
}) {
    if (isLive) {
        return <p className="text-sm text-muted-foreground">{NO_LIVE_VALUE_TEXT}</p>;
    }
    switch (values.phase) {
        case AdviceValuesPhase.Failed: {
            return (
                <div className="flex flex-col gap-2">
                    <p className="text-sm text-muted-foreground">
                        Left out: {values.reason}
                    </p>
                    <Button
                        className="self-start"
                        onClick={values.retry}
                        variant="outline"
                    >
                        Retry the value views
                    </Button>
                </div>
            );
        }
        case AdviceValuesPhase.Idle: {
            return (
                <p className="text-sm text-muted-foreground">
                    The value views are unavailable for this account state.
                </p>
            );
        }
        case AdviceValuesPhase.Loading: {
            return (
                <div aria-busy="true" aria-label="Computing the value views">
                    <Skeleton className="h-16 w-full" />
                </div>
            );
        }
        case AdviceValuesPhase.Ready: {
            return children;
        }
    }
}
