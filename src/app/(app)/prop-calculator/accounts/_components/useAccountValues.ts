'use client';

import { useMemo } from 'react';

import { useTodayIsoDate } from '~/app/(app)/prop-calculator/_components/useTodayIsoDate';
import {
    type AccountFromStateFigures,
    type DocumentedRunFigures,
    overviewPlanOptInsOf,
    overviewPlanValueRequestsFor,
    type OverviewRequest,
    overviewRequestKey,
    OverviewRequestKind,
    overviewRequestsFor,
    type PlanValuesFigures,
    withPreviousAccount,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import { type AccountListBoards } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { accountStateUnavailableText } from '~/app/(app)/prop-calculator/accounts/_components/accountStateReasonText';
import {
    type AccountValueColumns,
    accountValueColumnsOf,
    type AccountValueInput,
    AccountValueInputKind,
    type AccountValueLedgerOnlyInput,
    type AccountValueNotValuedInput,
    ExpectedPayoutsKind,
    expectedValueOf,
    nextActionOf,
    NextActionSourceKind,
    type NextActionView,
    type RealizedAttemptFigures,
} from '~/app/(app)/prop-calculator/accounts/_components/accountValueColumns';
import {
    accountFromStateRequestOf,
    buildSizingAdvisor,
    personalAdvisorOptionsOf,
    readinessBoardInputsOf,
    SizingAdvisorBuildKind,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/personalRuleOptions';
import {
    FROM_STATE_NOT_MODELED_TEXT,
    type FromStateDetail,
    FromStateDetailKind,
    type FromStateDetailRequests,
    fromStateDetailRequestsOf,
} from '~/app/(app)/prop-calculator/accounts/_components/detail/fromStateDetail';
import { measuredRebuyLagFromStats } from '~/app/(app)/prop-calculator/accounts/_components/measuredRebuyLag';
import { previousAccountOf } from '~/app/(app)/prop-calculator/accounts/_components/overview/accountFromStateModel';
import {
    type EngineSlot,
    engineSlotOf,
    type SlotEngine,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/engineSlot';
import {
    accountStatesForRows,
    DEFAULT_REALIZED_HORIZON_DAYS,
    ledgerOrDateFailure,
    type OverviewAccountRow,
    OverviewSectionStatus,
    type PortfolioLoad,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { useOverviewWorker } from '~/app/(app)/prop-calculator/accounts/_components/overview/useOverviewWorker';
import { usePortfolioData } from '~/app/(app)/prop-calculator/accounts/_components/overview/usePortfolioData';
import {
    type AccountStateEntry,
    type AccountStateEventRow,
    AccountStateKind,
    type AccountStatePayoutRow,
    type AccountStateSnapshotRow,
    AccountStateUnavailableKind,
    type AccountStateUnavailableReason,
    accountSubstateOf,
    cushionBoardOf,
    type FirmPayoutCount,
    firmPayoutCountOrNull,
    firmPayoutCounts,
    isActiveAccount,
    isLedgerOnlyAccount,
    latestTwoSnapshots,
    type ModeledAccountRow,
    paidPayoutsSinceLastLiveAccountFor,
    payoutReadinessBoardOf,
    PortfolioLedger,
    realizedAttemptEconomics,
    replacementStats,
    type SnapshotAccountRow,
    snapshotAdviceInputFor,
    SnapshotAdviceInputKind,
    snapshotInputFrom,
    trackedAccountOf,
} from '~/lib/prop-accounts';
import {
    type Plan,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AccountAction,
    DEFAULT_RULEBOOK,
    type MeasuredRebuyLag,
    type ReconstructedAccount,
    ReconstructedLiveKind,
    type RulebookParameters,
    type SampleThresholds,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

enum PreparedKind {
    Final = 'final',
    Modeled = 'modeled',
}

export interface AccountValues {
    readonly boards: AccountListBoards | null;
    readonly columns: ReadonlyMap<string, AccountValueColumns>;
    readonly notice: null | string;
}

interface AccountValuesInput {
    readonly accountId?: string;
    readonly extraRequests?: readonly OverviewRequest[];
    readonly includeFromStateDetail?: boolean;
    readonly userId?: string;
}

interface AccountValuesPreparation {
    readonly accounts: readonly PreparedAccount[];
    readonly boards: AccountListBoards | null;
    readonly highlightWithinDays: number;
    readonly isSettled: boolean;
    readonly notice: null | string;
    readonly requests: readonly OverviewRequest[];
    readonly sampleThresholds: SampleThresholds;
}

interface ModeledPreparationInputs {
    readonly accountId: string;
    readonly events: readonly AccountStateEventRow[];
    readonly firmCounts: readonly FirmPayoutCount[];
    readonly firmCountsAt: (asOf: string) => readonly FirmPayoutCount[];
    readonly includeFromStateDetail: boolean;
    readonly isActive: boolean;
    readonly payouts: readonly AccountStatePayoutRow[];
    readonly realizedByPlan: ReadonlyMap<string, RealizedAttemptFigures>;
    readonly row: OverviewAccountRow;
    readonly rulebook: RulebookParameters;
    readonly snapshots: readonly AccountStateSnapshotRow[];
    readonly state: AccountStateEntry | undefined;
    readonly stats: ReturnType<typeof replacementStats>;
    readonly today: string;
    readonly tracked: ModeledAccountRow<SnapshotAccountRow>;
}

type PreparedAccount =
    | {
          readonly accountId: string;
          readonly input:
              AccountValueLedgerOnlyInput | AccountValueNotValuedInput;
          readonly kind: PreparedKind.Final;
      }
    | {
          readonly accountId: string;
          readonly kind: PreparedKind.Modeled;
          readonly modeled: PreparedModeled;
      };

interface PreparedModeled {
    readonly action: NextActionView;
    readonly realized: null | RealizedAttemptFigures;
    readonly requests: PreparedRequests;
    readonly retryFee: number;
    readonly stage: SizingStage.Eval | SizingStage.Funded;
}

interface PreparedRequests {
    readonly account: OverviewRequest | undefined;
    readonly detail: FromStateDetailRequests | null;
    readonly documented: OverviewRequest | undefined;
    readonly planValues: OverviewRequest | undefined;
}

const NO_REQUESTS: readonly OverviewRequest[] = [];

const FROM_STATE_UNAVAILABLE_PREFIX =
    'The figures from this state cannot be computed: ';

const FIRM_COUNT_UNKNOWN_TEXT =
    'The firm payout count is unknown, so no figures from this state are computed.';

const LIVE_NOT_VALUED_TEXT = 'A live account has no from-state value model.';

const MISSING_ACCOUNT_TEXT =
    'This account is not among the accounts that were loaded, so no figures from its state can be computed.';

const MISSING_STATE_TEXT = 'its state could not be built';

const SUSPENDED_ACTION_TEXT =
    'Suspended: no sizing until the account is Active again';

const SUSPENDED_NOT_VALUED_TEXT =
    'A suspended account is neither sized nor valued.';

const MIXED_USERS_TEXT =
    'The accounts belong to more than one user, so no values are shown.';

const UNAVAILABLE_TEXT =
    'Expected payouts and next actions are unavailable because your accounts, ledger or rulebook could not be loaded.';

export function expectedValuesOf(
    values: AccountValues,
): ReadonlyMap<string, null | number> {
    const isSettled = !hasPendingValues(values);
    return new Map(
        values.columns
            .entries()
            .map(([accountId, columns]) => [
                accountId,
                isSettled ? expectedValueOf(columns) : null,
            ]),
    );
}

export function hasPendingValues(values: AccountValues): boolean {
    return values.columns
        .values()
        .some(
            (columns) =>
                columns.expectedPayouts.kind === ExpectedPayoutsKind.Pending,
        );
}

export function useAccountDetailValues({
    accountId,
    userId,
}: {
    readonly accountId: string;
    readonly userId: string;
}): {
    readonly detail: FromStateDetail;
    readonly values: AccountValues;
} {
    const { detail, values } = useAccountValuesCore({
        accountId,
        includeFromStateDetail: true,
        userId,
    });
    return { detail, values };
}

export function useAccountValuesWithEngine(input: AccountValuesInput = {}): {
    readonly engine: SlotEngine;
    readonly values: AccountValues;
} {
    const { engine, values } = useAccountValuesCore(input);
    return { engine, values };
}

function accountValuesOf(
    preparation: AccountValuesPreparation,
    engine: SlotEngine,
): AccountValues {
    const options = {
        highlightWithinDays: preparation.highlightWithinDays,
        sampleThresholds: preparation.sampleThresholds,
    };
    return {
        boards: preparation.boards,
        columns: new Map(
            preparation.accounts.map((prepared) => [
                prepared.accountId,
                accountValueColumnsOf(inputOf(prepared, engine), options),
            ]),
        ),
        notice: preparation.notice,
    };
}

function actionOf({
    asOf,
    measuredRebuyLag,
    paidPayoutsSinceLastLiveAccount,
    plan,
    reconstructed,
    row,
    rulebook,
    today,
}: {
    readonly asOf: string;
    readonly measuredRebuyLag: MeasuredRebuyLag | null;
    readonly paidPayoutsSinceLastLiveAccount: null | number;
    readonly plan: Plan;
    readonly reconstructed: ReconstructedAccount;
    readonly row: OverviewAccountRow;
    readonly rulebook: RulebookParameters;
    readonly today: string;
}): NextActionView {
    const build = buildSizingAdvisor(
        reconstructed,
        personalAdvisorOptionsOf({
            account: reconstructed,
            measuredRebuyLag,
            paidPayoutsSinceLastLiveAccount,
            personalRules: row.personalRules,
            plan,
            rulebook,
            snapshotAsOf: asOf,
            status: row.status,
            today,
        }),
    );
    switch (build.kind) {
        case SizingAdvisorBuildKind.NotModeled: {
            return nextActionOf({
                kind: NextActionSourceKind.NotModeled,
                reason: build.reason,
            });
        }
        case SizingAdvisorBuildKind.Ready: {
            return nextActionOf({
                advice: build.advisor.assemble([]),
                kind: NextActionSourceKind.Advice,
            });
        }
    }
}

function boardsOf(
    rulebook: RulebookParameters,
    accounts: readonly OverviewAccountRow[],
    states: readonly AccountStateEntry[],
    firmCounts: readonly FirmPayoutCount[],
): AccountListBoards {
    const readinessInputs = readinessBoardInputsOf(
        accounts,
        states,
        firmCounts,
    );
    return {
        cushion: cushionBoardOf(rulebook, states),
        readiness: payoutReadinessBoardOf(
            rulebook,
            readinessInputs.states,
            readinessInputs.overrides,
        ),
    };
}

function documentedSlotOf(
    engine: SlotEngine,
    request: OverviewRequest | undefined,
): EngineSlot<DocumentedRunFigures> {
    return engineSlotOf(engine, request, (result) =>
        result.kind === OverviewRequestKind.DocumentedRun
            ? result.figures
            : null,
    );
}

function emptyPreparation(load: PortfolioLoad): AccountValuesPreparation {
    return {
        accounts: [],
        boards: null,
        highlightWithinDays: highlightWithinDaysOf(load.rulebook),
        isSettled: false,
        notice: null,
        requests: NO_REQUESTS,
        sampleThresholds: load.sampleThresholds,
    };
}

function fromStateDetailOf(
    preparation: AccountValuesPreparation,
    accountId: string | undefined,
    engine: SlotEngine,
): FromStateDetail {
    if (preparation.notice !== null) {
        return {
            kind: FromStateDetailKind.Unavailable,
            reason: preparation.notice,
        };
    }
    const prepared = preparation.accounts.find(
        (candidate) => candidate.accountId === accountId,
    );
    if (prepared === undefined) {
        return preparation.isSettled
            ? {
                  kind: FromStateDetailKind.Unavailable,
                  reason: MISSING_ACCOUNT_TEXT,
              }
            : { kind: FromStateDetailKind.Pending };
    }
    switch (prepared.kind) {
        case PreparedKind.Final: {
            return {
                kind: FromStateDetailKind.Unavailable,
                reason: `${FROM_STATE_UNAVAILABLE_PREFIX}${prepared.input.reason}`,
            };
        }
        case PreparedKind.Modeled: {
            const { detail } = prepared.modeled.requests;
            return detail === null
                ? {
                      kind: FromStateDetailKind.Unavailable,
                      reason: FROM_STATE_NOT_MODELED_TEXT,
                  }
                : { engine, kind: FromStateDetailKind.Ready, requests: detail };
        }
    }
}

function fromStateSlotOf(
    engine: SlotEngine,
    request: OverviewRequest | undefined,
): EngineSlot<AccountFromStateFigures> {
    return engineSlotOf(engine, request, (result) =>
        result.kind === OverviewRequestKind.AccountFromState
            ? result.figures
            : null,
    );
}

function highlightWithinDaysOf(rulebook: null | RulebookParameters): number {
    return (rulebook ?? DEFAULT_RULEBOOK).display.nextPayoutHighlightDays;
}

function inputOf(
    prepared: PreparedAccount,
    engine: SlotEngine,
): AccountValueInput {
    switch (prepared.kind) {
        case PreparedKind.Final: {
            return prepared.input;
        }
        case PreparedKind.Modeled: {
            const { modeled } = prepared;
            return {
                action: modeled.action,
                documented: documentedSlotOf(
                    engine,
                    modeled.requests.documented,
                ),
                fromState: fromStateSlotOf(engine, modeled.requests.account),
                kind: AccountValueInputKind.Modeled,
                planValues: planValuesSlotOf(
                    engine,
                    modeled.requests.planValues,
                ),
                realized: modeled.realized,
                retryFee: modeled.retryFee,
                stage: modeled.stage,
            };
        }
    }
}

function ledgerOnlyPrepared(
    tracked: Parameters<typeof snapshotAdviceInputFor>[1],
    accountId: string,
    today: string,
): PreparedAccount {
    const adapted = snapshotAdviceInputFor(
        null,
        tracked,
        null,
        [],
        [],
        today,
        null,
    );
    switch (adapted.kind) {
        case SnapshotAdviceInputKind.LedgerOnly: {
            return {
                accountId,
                input: {
                    kind: AccountValueInputKind.LedgerOnly,
                    reason: adapted.reason,
                },
                kind: PreparedKind.Final,
            };
        }
        case SnapshotAdviceInputKind.Modeled: {
            throw new Error(
                'useAccountValues: a ledger-only account produced a modeled advice input',
            );
        }
    }
}

function modeledPrepared(inputs: ModeledPreparationInputs): PreparedAccount {
    const { accountId, row, state } = inputs;
    if (state === undefined) {
        return unavailablePrepared(
            accountId,
            NextActionSourceKind.NotModeled,
            MISSING_STATE_TEXT,
        );
    }
    if (state.state.kind === AccountStateKind.Unavailable) {
        return unavailablePrepared(
            accountId,
            unavailableActionKind(state.state.reason),
            accountStateUnavailableText(row, state.state.reason),
        );
    }
    const { latest, plan } = state.state;
    const planSerial = serializePlanId(plan.id);
    const measuredRebuyLag = measuredRebuyLagFromStats(
        inputs.stats,
        planSerial,
    );
    const action = actionOf({
        asOf: latest.asOf,
        measuredRebuyLag,
        paidPayoutsSinceLastLiveAccount: paidPayoutsSinceLastLiveAccountFor(
            inputs.firmCounts,
            plan.id.firm,
        ),
        plan,
        reconstructed: latest.reconstructed,
        row,
        rulebook: inputs.rulebook,
        today: inputs.today,
    });
    if (latest.reconstructed.kind === ReconstructedLiveKind.Live) {
        return {
            accountId,
            input: {
                action,
                kind: AccountValueInputKind.NotValued,
                reason: LIVE_NOT_VALUED_TEXT,
            },
            kind: PreparedKind.Final,
        };
    }
    if (accountSubstateOf(row.status) !== null) {
        return {
            accountId,
            input: {
                action: {
                    action: AccountAction.NotModeled,
                    reason: SUSPENDED_NOT_VALUED_TEXT,
                    text: SUSPENDED_ACTION_TEXT,
                },
                kind: AccountValueInputKind.NotValued,
                reason: SUSPENDED_NOT_VALUED_TEXT,
            },
            kind: PreparedKind.Final,
        };
    }
    const firmCount = firmPayoutCountOrNull(inputs.firmCounts, plan.id.firm);
    if (firmCount === null) {
        return {
            accountId,
            input: {
                action,
                kind: AccountValueInputKind.NotValued,
                reason: FIRM_COUNT_UNKNOWN_TEXT,
            },
            kind: PreparedKind.Final,
        };
    }
    const { latest: snapshot } = latestTwoSnapshots(inputs.snapshots);
    const { input, pendingPayoutCounts, personalMaxRiskPerTrade } =
        snapshotInputFrom(
            plan,
            inputs.tracked,
            snapshot,
            inputs.events,
            inputs.payouts,
            inputs.today,
            firmCount,
        );
    const planInput = {
        firmId: plan.id.firm,
        measuredRebuyLag,
        optIns: overviewPlanOptInsOf(plan),
        planSerial,
    };
    const detail = inputs.includeFromStateDetail
        ? fromStateDetailRequestsOf({
              input,
              measuredRebuyLag,
              pendingPayoutCounts,
              personalMaxRiskPerTrade,
              personalRules: row.personalRules,
              plan,
              rulebook: inputs.rulebook,
          })
        : null;
    const accountRequest =
        detail?.account ??
        withPreviousAccount(
            accountFromStateRequestOf({
                account: input,
                measuredRebuyLag,
                pendingPayoutCounts,
                personalMaxRiskPerTrade,
                personalRules: row.personalRules,
                plan,
                rulebook: inputs.rulebook,
            }),
            previousAccountOf({
                accountId,
                events: inputs.events,
                firmCountAt: (asOf) =>
                    firmPayoutCountOrNull(inputs.firmCountsAt(asOf), plan.id.firm),
                payouts: inputs.payouts,
                plan,
                rulebook: inputs.rulebook,
                snapshots: inputs.snapshots,
                state: state.state,
                tracked: inputs.tracked,
            }),
        );
    const isEval = latest.reconstructed.kind === TradingPhase.Eval;
    const isValued = isEval && inputs.isActive;
    const [planValuesRequest] = isValued
        ? overviewPlanValueRequestsFor([planInput], inputs.rulebook)
        : [];
    const documentedRequest = isValued
        ? overviewRequestsFor([planInput], inputs.rulebook).find(
              (request) => request.kind === OverviewRequestKind.DocumentedRun,
          )
        : undefined;
    return {
        accountId,
        kind: PreparedKind.Modeled,
        modeled: {
            action,
            realized: inputs.realizedByPlan.get(planSerial) ?? null,
            requests: {
                account: accountRequest,
                detail,
                documented: documentedRequest,
                planValues: planValuesRequest,
            },
            retryFee: plan.retryFee(),
            stage: isEval ? SizingStage.Eval : SizingStage.Funded,
        },
    };
}

function planValuesSlotOf(
    engine: SlotEngine,
    request: OverviewRequest | undefined,
): EngineSlot<PlanValuesFigures> {
    return engineSlotOf(engine, request, (result) =>
        result.kind === OverviewRequestKind.PlanValues ? result.figures : null,
    );
}

function preparationOf({
    accountId,
    includeFromStateDetail,
    load,
    owner,
    rulebook,
    today,
}: {
    readonly accountId: string | undefined;
    readonly includeFromStateDetail: boolean;
    readonly load: PortfolioLoad;
    readonly owner: string;
    readonly rulebook: RulebookParameters;
    readonly today: string;
}): AccountValuesPreparation {
    const { alerts, ledger: section } = load;
    if (
        alerts.status !== OverviewSectionStatus.Ready ||
        section.status !== OverviewSectionStatus.Ready
    ) {
        return emptyPreparation(load);
    }
    const ledger = PortfolioLedger.fromRows(owner, section.rows);
    const firmCounts = firmPayoutCounts(ledger, today);
    const firmCountsByDate = new Map<string, readonly FirmPayoutCount[]>([
        [today, firmCounts],
    ]);
    const firmCountsAt = (asOf: string): readonly FirmPayoutCount[] => {
        const known = firmCountsByDate.get(asOf);
        if (known !== undefined) return known;
        const counts = firmPayoutCounts(ledger, asOf);
        firmCountsByDate.set(asOf, counts);
        return counts;
    };
    const stats = replacementStats(ledger);
    const { accounts, payouts, snapshots } = alerts.rows;
    const states = accountStatesForRows(
        owner,
        today,
        accounts,
        section.rows.events,
        payouts,
        snapshots,
    ).filter(
        (entry) => accountId === undefined || entry.accountId === accountId,
    );
    const stateById = new Map(states.map((entry) => [entry.accountId, entry]));
    const realizedByPlan = realizedFiguresOf(ledger, today);
    const prepared: PreparedAccount[] = [];
    for (const row of accounts) {
        if (accountId !== undefined && row.id !== accountId) continue;
        const isActive = isActiveAccount(row);
        if (!isActive && !includeFromStateDetail) continue;
        const tracked = trackedAccountOf({
            ...row,
            personalRules: row.personalRules ?? undefined,
        });
        if (isLedgerOnlyAccount(tracked)) {
            prepared.push(ledgerOnlyPrepared(tracked, row.id, today));
            continue;
        }
        prepared.push(
            modeledPrepared({
                accountId: row.id,
                events: section.rows.events.filter(
                    (event) =>
                        event.accountId === row.id && event.userId === owner,
                ),
                firmCounts,
                firmCountsAt,
                includeFromStateDetail,
                isActive,
                payouts: payouts.filter(
                    (payout) =>
                        payout.accountId === row.id && payout.userId === owner,
                ),
                realizedByPlan,
                row,
                rulebook,
                snapshots: snapshots.filter(
                    (snapshot) =>
                        snapshot.accountId === row.id &&
                        snapshot.userId === owner,
                ),
                state: stateById.get(row.id),
                stats,
                today,
                tracked,
            }),
        );
    }
    return {
        accounts: prepared,
        boards:
            accountId === undefined
                ? boardsOf(rulebook, accounts, states, firmCounts)
                : null,
        highlightWithinDays: highlightWithinDaysOf(rulebook),
        isSettled: true,
        notice: null,
        requests: requestsOf(prepared),
        sampleThresholds: load.sampleThresholds,
    };
}

function prepareAccountValues({
    accountId,
    includeFromStateDetail,
    load,
    today,
    userId,
}: {
    readonly accountId: string | undefined;
    readonly includeFromStateDetail: boolean;
    readonly load: PortfolioLoad;
    readonly today: string;
    readonly userId: string | undefined;
}): AccountValuesPreparation {
    const empty = emptyPreparation(load);
    const { alerts, ledger: section, rulebook } = load;
    if (
        alerts.status === OverviewSectionStatus.Failed ||
        section.status === OverviewSectionStatus.Failed
    ) {
        return { ...empty, isSettled: true, notice: UNAVAILABLE_TEXT };
    }
    if (
        rulebook === null ||
        alerts.status !== OverviewSectionStatus.Ready ||
        section.status !== OverviewSectionStatus.Ready
    ) {
        return empty;
    }
    const owner = userId ?? soleUserIdOf(alerts.rows.accounts);
    if (owner === null) {
        return alerts.rows.accounts.length === 0
            ? empty
            : { ...empty, isSettled: true, notice: MIXED_USERS_TEXT };
    }
    const computed = ledgerOrDateFailure(() =>
        preparationOf({
            accountId,
            includeFromStateDetail,
            load,
            owner,
            rulebook,
            today,
        }),
    );
    return computed.kind === OverviewSectionStatus.Ready
        ? computed.value
        : { ...empty, isSettled: true, notice: computed.message };
}

function realizedFiguresOf(
    ledger: PortfolioLedger,
    today: string,
): ReadonlyMap<string, RealizedAttemptFigures> {
    const economics = realizedAttemptEconomics(
        ledger,
        today,
        DEFAULT_REALIZED_HORIZON_DAYS,
    );
    return new Map(
        economics.perPlan.map((row) => {
            const fundedValue = row.decomposition?.value?.fundedValue;
            return [
                row.planSerial,
                {
                    fundedValue:
                        fundedValue === undefined || row.payoutRate === null
                            ? null
                            : { n: row.payoutRate.n, value: fundedValue },
                    passRate:
                        row.passRate === null
                            ? null
                            : { n: row.passRate.n, value: row.passRate.value },
                },
            ];
        }),
    );
}

function requestsOf(
    accounts: readonly PreparedAccount[],
): readonly OverviewRequest[] {
    return accounts.flatMap((prepared) =>
        prepared.kind === PreparedKind.Modeled
            ? [
                  prepared.modeled.requests.account,
                  prepared.modeled.requests.planValues,
                  prepared.modeled.requests.documented,
                  prepared.modeled.requests.detail?.retire,
                  prepared.modeled.requests.detail?.chain,
              ].filter((request) => request !== undefined)
            : NO_REQUESTS,
    );
}

function soleUserIdOf(accounts: readonly OverviewAccountRow[]): null | string {
    const owners = new Set(accounts.map((account) => account.userId));
    const [owner] = owners;
    return owner !== undefined && owners.size === 1 ? owner : null;
}

function unavailableActionKind(
    reason: AccountStateUnavailableReason,
): NextActionSourceKind.EnterSnapshot | NextActionSourceKind.NotModeled {
    switch (reason.kind) {
        case AccountStateUnavailableKind.FirmCountUnknown:
        case AccountStateUnavailableKind.LedgerOnly:
        case AccountStateUnavailableKind.UnresolvedPlan: {
            return NextActionSourceKind.NotModeled;
        }
        case AccountStateUnavailableKind.ImplausibleSnapshot:
        case AccountStateUnavailableKind.NoSnapshot:
        case AccountStateUnavailableKind.ReconstructionError: {
            return NextActionSourceKind.EnterSnapshot;
        }
    }
}

function unavailablePrepared(
    accountId: string,
    kind: NextActionSourceKind.EnterSnapshot | NextActionSourceKind.NotModeled,
    reason: string,
): PreparedAccount {
    return {
        accountId,
        input: {
            action: nextActionOf({ kind, reason }),
            kind: AccountValueInputKind.NotValued,
            reason,
        },
        kind: PreparedKind.Final,
    };
}

function uniqueRequestsOf(
    requests: readonly OverviewRequest[],
): readonly OverviewRequest[] {
    const byKey = new Map<string, OverviewRequest>();
    for (const request of requests) {
        const key = overviewRequestKey(request);
        if (!byKey.has(key)) byKey.set(key, request);
    }
    return byKey.values().toArray();
}

function useAccountValuesCore({
    accountId,
    extraRequests = NO_REQUESTS,
    includeFromStateDetail = false,
    userId,
}: AccountValuesInput): {
    readonly detail: FromStateDetail;
    readonly engine: SlotEngine;
    readonly values: AccountValues;
} {
    const load = usePortfolioData();
    const today = useTodayIsoDate();
    const preparation = useMemo(
        () =>
            prepareAccountValues({
                accountId,
                includeFromStateDetail,
                load,
                today,
                userId,
            }),
        [accountId, includeFromStateDetail, load, today, userId],
    );
    const requests = useMemo(
        () => uniqueRequestsOf([...extraRequests, ...preparation.requests]),
        [extraRequests, preparation.requests],
    );
    const engine = useOverviewWorker(requests);
    const values = useMemo(
        () => accountValuesOf(preparation, engine),
        [engine, preparation],
    );
    const detail = useMemo(
        () => fromStateDetailOf(preparation, accountId, engine),
        [accountId, engine, preparation],
    );
    return { detail, engine, values };
}
