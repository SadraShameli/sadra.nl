'use client';

import { useMemo } from 'react';

import { useTodayIsoDate } from '~/app/(app)/prop-calculator/_components/useTodayIsoDate';
import {
    type AccountFromStateFigures,
    type DocumentedRunFigures,
    type OverviewAccountPlanInput,
    overviewAccountRequestsFor,
    overviewPlanOptInsOf,
    overviewPlanValueRequestsFor,
    type OverviewRequest,
    OverviewRequestKind,
    overviewRequestsFor,
    type PlanValuesFigures,
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
    DEFAULT_NEXT_PAYOUT_HIGHLIGHT_DAYS,
    ExpectedPayoutsKind,
    expectedValueOf,
    nextActionOf,
    NextActionSourceKind,
    type NextActionView,
    type RealizedAttemptFigures,
} from '~/app/(app)/prop-calculator/accounts/_components/accountValueColumns';
import {
    buildSizingAdvisor,
    personalAdvisorOptionsOf,
    personalPolicyOverridesOf,
    readinessOverridesOf,
    SizingAdvisorBuildKind,
    withPersonalPolicy,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/personalRuleOptions';
import { measuredRebuyLagFromStats } from '~/app/(app)/prop-calculator/accounts/_components/measuredRebuyLag';
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
    cushionBoardOf,
    isActiveAccount,
    isLedgerOnlyAccount,
    latestTwoSnapshots,
    type ModeledAccountRow,
    payoutReadinessBoardOf,
    PortfolioLedger,
    readPersonalRulesOrNull,
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

interface AccountValues {
    readonly boards: AccountListBoards | null;
    readonly columns: ReadonlyMap<string, AccountValueColumns>;
    readonly notice: null | string;
}

interface AccountValuesPreparation {
    readonly accounts: readonly PreparedAccount[];
    readonly boards: AccountListBoards | null;
    readonly notice: null | string;
    readonly requests: readonly OverviewRequest[];
    readonly sampleThresholds: SampleThresholds;
}

interface ModeledPreparationInputs {
    readonly accountId: string;
    readonly events: readonly AccountStateEventRow[];
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
    readonly documented: OverviewRequest | undefined;
    readonly planValues: OverviewRequest | undefined;
}

const NO_REQUESTS: readonly OverviewRequest[] = [];

const LIVE_NOT_VALUED_TEXT = 'A live account has no from-state value model.';

const MISSING_STATE_TEXT = 'its state could not be built';

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

export function useAccountValues({
    accountId,
    userId,
}: {
    readonly accountId?: string;
    readonly userId?: string;
} = {}): AccountValues {
    const load = usePortfolioData();
    const today = useTodayIsoDate();
    const preparation = useMemo(
        () => prepareAccountValues({ accountId, load, today, userId }),
        [accountId, load, today, userId],
    );
    const engine = useOverviewWorker(preparation.requests);
    return useMemo(
        () => accountValuesOf(preparation, engine),
        [engine, preparation],
    );
}

function accountValuesOf(
    preparation: AccountValuesPreparation,
    engine: SlotEngine,
): AccountValues {
    const options = {
        highlightWithinDays: DEFAULT_NEXT_PAYOUT_HIGHLIGHT_DAYS,
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
    plan,
    reconstructed,
    row,
    rulebook,
    today,
}: {
    readonly asOf: string;
    readonly measuredRebuyLag: MeasuredRebuyLag | null;
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
            personalRules: row.personalRules,
            plan,
            rulebook,
            snapshotAsOf: asOf,
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
): AccountListBoards {
    return {
        cushion: cushionBoardOf(rulebook, states),
        readiness: payoutReadinessBoardOf(
            rulebook,
            states,
            readinessOverridesOf(accounts),
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

function emptyPreparation(
    sampleThresholds: SampleThresholds,
): AccountValuesPreparation {
    return {
        accounts: [],
        boards: null,
        notice: null,
        requests: NO_REQUESTS,
        sampleThresholds,
    };
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
    const adapted = snapshotAdviceInputFor(null, tracked, null, [], [], today);
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
    const { latest: snapshot } = latestTwoSnapshots(inputs.snapshots);
    const { input } = snapshotInputFrom(
        plan,
        inputs.tracked,
        snapshot,
        inputs.events,
        inputs.payouts,
        latest.asOf,
    );
    const planInput = {
        firmId: plan.id.firm,
        measuredRebuyLag,
        optIns: overviewPlanOptInsOf(plan),
        planSerial,
    };
    const accountInput: OverviewAccountPlanInput = {
        ...planInput,
        account: input,
    };
    const [rulebookAccountRequest] = overviewAccountRequestsFor(
        [accountInput],
        inputs.rulebook,
    );
    const personalOverrides = personalPolicyOverridesOf(
        readPersonalRulesOrNull(row.personalRules),
    );
    const accountRequest =
        rulebookAccountRequest === undefined
            ? undefined
            : {
                  ...rulebookAccountRequest,
                  spec: withPersonalPolicy(
                      rulebookAccountRequest.spec,
                      personalOverrides,
                  ),
              };
    const isEval = latest.reconstructed.kind === TradingPhase.Eval;
    const [planValuesRequest] = isEval
        ? overviewPlanValueRequestsFor([planInput], inputs.rulebook)
        : [];
    const documentedRequest = isEval
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
    load,
    owner,
    rulebook,
    today,
}: {
    readonly accountId: string | undefined;
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
        return emptyPreparation(load.sampleThresholds);
    }
    const ledger = PortfolioLedger.fromRows(owner, section.rows);
    const stats = replacementStats(ledger);
    const { accounts, payouts, snapshots } = alerts.rows;
    const isRequested = (row: { readonly accountId: string }) =>
        accountId === undefined || row.accountId === accountId;
    const states = accountStatesForRows(
        owner,
        today,
        accounts.filter((row) => isRequested({ accountId: row.id })),
        section.rows.events.filter((event) => isRequested(event)),
        payouts.filter((payout) => isRequested(payout)),
        snapshots.filter((snapshot) => isRequested(snapshot)),
    );
    const stateById = new Map(states.map((entry) => [entry.accountId, entry]));
    const realizedByPlan = realizedFiguresOf(ledger, today);
    const prepared: PreparedAccount[] = [];
    for (const row of accounts) {
        if (accountId !== undefined && row.id !== accountId) continue;
        if (!isActiveAccount(row)) continue;
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
                ? boardsOf(rulebook, accounts, states)
                : null,
        notice: null,
        requests: requestsOf(prepared),
        sampleThresholds: load.sampleThresholds,
    };
}

function prepareAccountValues({
    accountId,
    load,
    today,
    userId,
}: {
    readonly accountId: string | undefined;
    readonly load: PortfolioLoad;
    readonly today: string;
    readonly userId: string | undefined;
}): AccountValuesPreparation {
    const empty = emptyPreparation(load.sampleThresholds);
    const { alerts, ledger: section, rulebook } = load;
    if (
        alerts.status === OverviewSectionStatus.Failed ||
        section.status === OverviewSectionStatus.Failed
    ) {
        return { ...empty, notice: UNAVAILABLE_TEXT };
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
            : { ...empty, notice: MIXED_USERS_TEXT };
    }
    const computed = ledgerOrDateFailure(() =>
        preparationOf({ accountId, load, owner, rulebook, today }),
    );
    return computed.kind === OverviewSectionStatus.Ready
        ? computed.value
        : { ...empty, notice: computed.message };
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
        case AccountStateUnavailableKind.ImplausibleSnapshot:
        case AccountStateUnavailableKind.NoSnapshot:
        case AccountStateUnavailableKind.ReconstructionError: {
            return NextActionSourceKind.EnterSnapshot;
        }
        case AccountStateUnavailableKind.LedgerOnly:
        case AccountStateUnavailableKind.UnresolvedPlan: {
            return NextActionSourceKind.NotModeled;
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
