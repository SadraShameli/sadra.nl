import { type ArgsDef } from 'citty';
import { z } from 'zod';

import type { DpAdviceRepo, PropDatabase } from '~/lib/prop-accounts/server';

import {
    dpArguments,
    fundedDpModelGapWarning,
    registryWarmUpFailureWarning,
} from '~/cli/commands/prop/optimize/dp/command';
import {
    readNonNegativeNumber,
    readPositiveInteger,
    readPositiveNumber,
} from '~/cli/commands/prop/shared';
import {
    findUserByEmail,
    readUserEmail,
} from '~/cli/commands/prop/userByEmail';
import { ui } from '~/cli/ui';
import {
    AccountStateKind,
    accountStatesOf,
    AccountStatus,
    accountSubstateOf,
    latestTwoSnapshots,
    optionalDollars,
    personalMaxRiskOf,
    type PersonalRules,
} from '~/lib/prop-accounts';
import { todayIsoDate } from '~/lib/prop-accounts/core';
import {
    dollars,
    findFirm,
    type FirmAccountPolicy,
    type InstrumentSymbol,
    NO_PLAN_OPT_INS,
    type Plan,
    type PlanOptIns,
    points,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    buildEnginePolicy,
    createSizingAdvisor,
    DEFAULT_RULEBOOK,
    differenceReasonText,
    documentedPeakRiskOf,
    type DocumentedSizing,
    DP_ADVICE_SOLVER_VERSION,
    DP_GATE_FAILURE_TEXT,
    DP_SAMPLES_UNAVAILABLE_TEXT,
    type DpAdviceGapEntry,
    type DpAdviceRow,
    dpGateFailureText,
    dpMoney,
    dpOwnGapText,
    type DpRiskSample,
    DpSamplesKind,
    DpSampleStage,
    FUNDED_SWEEP_DEFAULT_SEED,
    FUNDED_SWEEP_DEFAULT_SIMS,
    InstantFundedEvalAdvisorError,
    isFundedDpModelGap,
    type MeasuredRebuyLag,
    type ReconstructedAccount,
    ReconstructedLiveKind,
    type RulebookParameters,
    type SizingAdvisorCreateOptions,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';
import {
    buildDpSolverCall,
    type DpAdvice,
    type DpAdviceAccount,
    dpAdviceFor,
    dpConfigKey,
    dpEligibility,
    type DpEligibility,
    dpSampleStageOf,
    type DpSolutionView,
    type DpSolveConfig,
    dpSolveConfigFor,
    type DpSolveConfigInput,
    type DpStateValues,
    DpStateValuesKind,
    dpStateValuesOf,
    type DpTradeValueCents,
    dpValidationFor,
    type DpValueCents,
    type DpValuesSolution,
    ineligibleDpAdvice,
} from '~/lib/prop-calculator/advisor/dp';
import { type DocumentedPolicySpec } from '~/lib/prop-calculator/advisor/policy';
import { VALUE_CHAIN_STEP_LABEL } from '~/lib/prop-calculator/advisor/value';
import {
    type AverageRewardConfig,
    RateSearchStatus,
    solveAverageRewardPolicy,
} from '~/lib/prop-calculator/core/AverageRewardSolver';
import {
    type FundedStateValueResult,
    warmFirmsRegistryCache,
    withRegistryPlanOptIns,
} from '~/lib/prop-calculator/core/FundedStateValue';
import { planRulesFingerprint } from '~/lib/prop-calculator/describe';

import { dpValueSamplesOf } from './dpValueSamples';

export enum DpRunMode {
    Account = 'account',
    AllAccounts = 'all-accounts',
    Snapshot = 'snapshot',
}

enum DpOutcomeKind {
    Advised = 'advised',
    Skipped = 'skipped',
}

enum DpSkipReason {
    AlreadyStored = 'already-stored',
    BudgetExhausted = 'budget-exhausted',
    EvalNotValidated = 'eval-not-validated',
    Failed = 'failed',
    LiveNotModeled = 'live-not-modeled',
    NoDocumentedSizing = 'no-documented-sizing',
    NotActive = 'not-active',
    SolveNotConverged = 'solve-not-converged',
    StateUnavailable = 'state-unavailable',
}

enum DpStorage {
    AlreadyStored = 'already-stored',
    NotRequested = 'not-requested',
    Stored = 'stored',
}

enum DpValuesOutput {
    Candidates = 'candidates',
    Hidden = 'hidden',
    Values = 'values',
}

export interface AdviseDpArguments {
    account?: string;
    'action-step-multiple'?: string;
    all?: boolean;
    candidates?: boolean;
    'copy-accounts': string;
    'cushion-step-multiple'?: string;
    dp?: boolean;
    'eval-days': string;
    'funded-days': string;
    iterations: string;
    'max-action-multiple'?: string;
    'max-cushion-multiple'?: string;
    'max-plans'?: string;
    'max-tail-cushion-multiple'?: string;
    'start-rate'?: string;
    store?: boolean;
    'tail-cushion-step-multiple'?: string;
    'time-budget-min'?: string;
    'user-email'?: string;
    values?: boolean;
    workers?: string;
}

export interface DpRequest {
    readonly accountId: null | string;
    readonly budget: DpBudget;
    readonly mode: DpRunMode;
    readonly settings: DpSettings;
    readonly store: boolean;
    readonly userEmail: null | string;
}

export interface DpRunInput {
    readonly budget: DpBudget;
    readonly clock?: () => number;
    readonly emit: (label: string, outcome: DpOutcome) => void;
    readonly settings: DpSettings;
    readonly sink: DpStoreSink | null;
    readonly solver?: DpSolver;
    readonly targets: readonly DpTargetLoad[];
}

export interface DpSettingsArguments extends AdviseDpArguments {
    commission: string;
    instrument: InstrumentSymbol;
    'rebuy-lag-days'?: string;
    'stop-points'?: string;
}

export type DpTargetLoad =
    | { readonly label: string; readonly skip: DpSkip; readonly target: null }
    | {
          readonly label: string;
          readonly skip: null;
          readonly target: DpTarget;
      };

interface DpBudget {
    readonly maxPlans: null | number;
    readonly timeBudgetMs: null | number;
}

interface DpEvalGridMultiples {
    readonly actionStep?: number;
    readonly cushionStep?: number;
    readonly maxAction?: number;
}

interface DpGroup {
    readonly members: readonly DpPlanned[];
}

type DpOutcome =
    | {
          readonly advice: DpAdvice;
          readonly kind: DpOutcomeKind.Advised;
          readonly plan: Plan;
          readonly runtimeMs: number;
          readonly storage: DpStorage;
          readonly values: DpStateValues | null;
          readonly valuesOutput: DpValuesOutput;
      }
    | {
          readonly detail: null | string;
          readonly kind: DpOutcomeKind.Skipped;
          readonly reason: DpSkipReason;
      };

interface DpPlanned {
    readonly config: DpSolveConfig;
    readonly eligibility: DpEligibility;
    readonly target: DpTarget;
}

interface DpSettings {
    readonly commission: number;
    readonly copyAccounts: number;
    readonly evalGrid: DpEvalGridMultiples;
    readonly fundedGrid: DpSolveConfigInput['fundedGrid'];
    readonly fundedHorizonDays: number;
    readonly maxEvalDays: number;
    readonly maxSolves: number;
    readonly maxWorkers: number | undefined;
    readonly measuredRebuyLag: MeasuredRebuyLag | null;
    readonly positionSizing: DpSolveConfig['positionSizing'];
    readonly startRatePerDay: null | number;
    readonly valuesOutput: DpValuesOutput;
}

interface DpSkip {
    readonly detail: null | string;
    readonly reason: DpSkipReason;
}

type DpSolver = (config: AverageRewardConfig) => DpSolverOutput;

type DpSolverOutput = DpSolutionView &
    DpValuesSolution &
    Readonly<{
        fundedResult: Pick<FundedStateValueResult, 'unconvergedLevelCount'>;
        status: RateSearchStatus;
    }>;

interface DpStoreSink {
    isStored(
        target: DpStoreTarget,
        configKey: string,
        solverVersion: number,
    ): Promise<boolean>;
    record(
        target: DpStoreTarget,
        row: DpAdviceRow,
        values: DpStateValues | null,
    ): Promise<DpStorage>;
}

interface DpStoreTarget {
    readonly accountId: string;
    readonly snapshotId: string;
}

interface DpTarget {
    readonly account: DpAdviceAccount;
    readonly accountPolicy: FirmAccountPolicy | undefined;
    readonly documented: DocumentedSizing | null;
    readonly label: string;
    readonly optIns: PlanOptIns;
    readonly personalPayoutRequest: null | number;
    readonly personalRetainedCushion: null | number;
    readonly rulebook: RulebookParameters;
    readonly store: DpStoreTarget | null;
}

const DP_ONLY_FLAGS = [
    'account',
    'action-step-multiple',
    'all',
    'candidates',
    'copy-accounts',
    'cushion-step-multiple',
    'eval-days',
    'funded-days',
    'iterations',
    'max-action-multiple',
    'max-cushion-multiple',
    'max-plans',
    'max-tail-cushion-multiple',
    'start-rate',
    'store',
    'tail-cushion-step-multiple',
    'time-budget-min',
    'user-email',
    'values',
    'workers',
] as const;

const DATABASE_MODE_FLAGS: ReadonlySet<string> = new Set([
    ...DP_ONLY_FLAGS,
    'commission',
    'dp',
    'instrument',
    'rebuy-lag-days',
    'stop-points',
]);

const SNAPSHOT_MODE_NEEDS_ACCOUNT = [
    'max-plans',
    'store',
    'time-budget-min',
    'user-email',
] as const;

const SNAPSHOT_MODE_REFUSED = [
    'early-withdrawal',
    'funded-reset',
    'json',
    'matrix',
] as const;

const MS_PER_MINUTE = 60_000;
const MS_PER_SECOND = 1000;

const SKIP_REASON_TEXT: Readonly<Record<DpSkipReason, string>> = {
    [DpSkipReason.AlreadyStored]:
        'already stored for this snapshot, config key and solver version, so it was not solved again',
    [DpSkipReason.BudgetExhausted]:
        'not solved: the run budget ran out before this plan was reached',
    [DpSkipReason.EvalNotValidated]:
        'eval DP rows are shown only for a validated plan, so the solve was not run',
    [DpSkipReason.Failed]: 'failed',
    [DpSkipReason.LiveNotModeled]:
        'a live account has no eval or funded DP to solve',
    [DpSkipReason.NoDocumentedSizing]:
        'no documented sizing to space the samples from (a stale or suspended snapshot, or no rule for this account)',
    [DpSkipReason.NotActive]: 'the account is not active',
    [DpSkipReason.SolveNotConverged]:
        'the solve did not converge, so no DP sizing is shown or stored',
    [DpSkipReason.StateUnavailable]:
        'the account state could not be rebuilt from its latest snapshot',
};

export const adviseDpArguments = {
    account: {
        description:
            'Read this stored account (its latest snapshot and your saved rulebook) instead of the snapshot flags, and show its DP advice. Needs --dp and --user-email',
        type: 'string',
    },
    'action-step-multiple': dpArguments['action-step-multiple'],
    all: {
        default: false,
        description:
            'Do the same for every active account of --user-email, one solve per distinct plan and config. Needs --dp',
        type: 'boolean',
    },
    candidates: {
        default: false,
        description:
            'With --values, also list every risk on the DP action grid with its value after a win, after a loss and its expected value. Needs --values',
        type: 'boolean',
    },
    'copy-accounts': dpArguments['copy-accounts'],
    'cushion-step-multiple': dpArguments['cushion-step-multiple'],
    dp: {
        default: false,
        description:
            'After the documented advice, solve the average-reward DP for the account and print its risk samples, gaps and validation state. Slow: a full-precision solve can take over an hour',
        type: 'boolean',
    },
    'eval-days': dpArguments['eval-days'],
    'funded-days': dpArguments['funded-days'],
    iterations: dpArguments.iterations,
    'max-action-multiple': dpArguments['max-action-multiple'],
    'max-cushion-multiple': dpArguments['max-cushion-multiple'],
    'max-plans': {
        description:
            'With --all, solve at most this many distinct plans, then list the rest as skipped',
        type: 'string',
    },
    'max-tail-cushion-multiple': dpArguments['max-tail-cushion-multiple'],
    'start-rate': dpArguments['start-rate'],
    store: {
        default: false,
        description:
            'Write the DP advice to your account history (prop_dp_advice), one row per account snapshot and config. Needs --account or --all, and --user-email',
        type: 'boolean',
    },
    'tail-cushion-step-multiple': dpArguments['tail-cushion-step-multiple'],
    'time-budget-min': {
        description:
            'With --all, start no new solve after this many minutes, then list the rest as skipped',
        type: 'string',
    },
    'user-email': {
        description:
            'The account owner, by email: every read and write is scoped to that user. Needs --account or --all',
        type: 'string',
    },
    values: {
        default: false,
        description:
            "Print the solved DP's values: your state (expected cash with no charge for time, and net of the solved rate per day), your documented rung after a win and after a loss, and the four value-chain states. Needs --dp",
        type: 'boolean',
    },
    workers: dpArguments.workers,
} satisfies ArgsDef;

export interface DpReporter {
    readonly emit: (label: string, outcome: DpOutcome) => void;
    readonly solveFinished: () => void;
    readonly solveStarted: (label: string) => void;
}

export function readDpRequest(
    arguments_: DpSettingsArguments,
    rawArgs: readonly string[],
): DpRequest | null {
    const present = flagsPresent(rawArgs);
    const dpOnly = DP_ONLY_FLAGS.filter((flag) => present.has(flag));
    if (arguments_.dp !== true) {
        if (dpOnly.length > 0) {
            throw new Error(
                `${flagList(dpOnly)} only apply with --dp, which solves the DP`,
            );
        }
        return null;
    }
    if (arguments_.candidates === true && arguments_.values !== true) {
        throw new Error('--candidates needs --values');
    }
    const accountId = readAccountId(arguments_.account);
    const isAll = arguments_.all === true;
    if (accountId !== null && isAll) {
        throw new Error('--account and --all cannot be combined');
    }
    const mode = dpModeOf(accountId, isAll);
    const isStore = arguments_.store === true;
    const userEmail = readUserEmail(arguments_['user-email']);
    if (mode === DpRunMode.Snapshot) {
        requireNone(
            SNAPSHOT_MODE_NEEDS_ACCOUNT.filter((flag) => present.has(flag)),
            'need --account or --all, which read stored accounts',
        );
        requireNone(
            SNAPSHOT_MODE_REFUSED.filter((flag) => present.has(flag)),
            'cannot be combined with --dp: the DP is solved for the plain plan (the snapshot reconstruction does not apply opt-ins) and printed as text',
        );
    } else {
        requireNone(
            [...present].filter((flag) => !DATABASE_MODE_FLAGS.has(flag)),
            "cannot be combined with --account or --all: the stored account's own snapshot, plan and your saved rulebook decide it",
        );
        if (userEmail === null) {
            throw new Error('--account and --all need --user-email');
        }
        if (mode === DpRunMode.Account) {
            requireNone(
                (['max-plans', 'time-budget-min'] as const).filter((flag) =>
                    present.has(flag),
                ),
                'bound --all only',
            );
        }
    }
    return {
        accountId,
        budget: {
            maxPlans:
                arguments_['max-plans'] === undefined
                    ? null
                    : readPositiveInteger(arguments_['max-plans'], 'max-plans'),
            timeBudgetMs:
                arguments_['time-budget-min'] === undefined
                    ? null
                    : readPositiveNumber(
                          arguments_['time-budget-min'],
                          'time-budget-min',
                      ) * MS_PER_MINUTE,
        },
        mode,
        settings: readDpSettings(arguments_),
        store: isStore,
        userEmail,
    };
}

export async function runDpDatabase(
    request: DpRequest,
    reporter: DpReporter = consoleReporter,
): Promise<void> {
    const { db, endDb } = await import('~/server/db');
    try {
        const { accountId, settings, store, userEmail } = request;
        if (userEmail === null) {
            throw new Error('--account and --all need --user-email');
        }
        const owner = await findUserByEmail(db, userEmail);
        const userId = owner.id;
        const targets = await loadDpDatabaseTargets({
            accountId,
            database: db,
            settings,
            store,
            today: todayIsoDate(new Date()),
            userId,
        });
        await runDpWithReporter(
            {
                budget: request.budget,
                settings,
                sink: store ? await dpStoreSinkFor(db, userId) : null,
                targets,
            },
            reporter,
        );
    } finally {
        await endDb();
    }
}

export async function runDpWithReporter(
    input: Omit<DpRunInput, 'emit'>,
    reporter: DpReporter = consoleReporter,
): Promise<void> {
    const warmUpFailure = await warmFirmsRegistryCache();
    if (warmUpFailure !== null) {
        ui.fail(registryWarmUpFailureWarning(warmUpFailure));
    }
    await runDpAdvice({
        ...input,
        emit: reporter.emit,
        solver: (config) => {
            reporter.solveStarted(config.objective.plan.label);
            try {
                return solveAverageRewardPolicy(config);
            } finally {
                reporter.solveFinished();
            }
        },
    });
}

export function snapshotDpTarget(input: {
    readonly account: ReconstructedAccount;
    readonly documented: DocumentedSizing | null;
    readonly label: string;
    readonly options: SizingAdvisorCreateOptions;
}): DpTargetLoad {
    const { account, documented, label, options } = input;
    if (account.kind === ReconstructedLiveKind.Live) {
        return skippedLoad(label, DpSkipReason.LiveNotModeled);
    }
    return {
        label,
        skip: null,
        target: {
            account,
            accountPolicy: options.accountPolicy,
            documented,
            label,
            optIns: NO_PLAN_OPT_INS,
            personalPayoutRequest: options.personalPayoutOverride ?? null,
            personalRetainedCushion: options.personalRetainedCushion ?? null,
            rulebook: options.rulebook,
            store: null,
        },
    };
}

function dpOutcomeLines(label: string, outcome: DpOutcome): string[] {
    if (outcome.kind === DpOutcomeKind.Skipped) {
        const detail = outcome.detail === null ? '' : `: ${outcome.detail}`;
        return [
            `DP advice for ${label}: skipped, ${SKIP_REASON_TEXT[outcome.reason]}${detail}`,
        ];
    }
    const { advice, plan, runtimeMs, storage } = outcome;
    const lines = [
        `DP advice for ${label} (${advice.objective}, solver ${advice.solverVersion}, config ${advice.configKey.slice(0, 12)})`,
        runtimeMs > 0
            ? `solved in ${(runtimeMs / MS_PER_SECOND).toFixed(1)}s`
            : 'not solved',
        validationLine(advice),
        ...sampleLines(advice),
        ...valueLines(outcome.values, outcome.valuesOutput),
        ...gapLines(advice.gaps, plan),
        ...advice.reasons.map((reason) => differenceReasonText(reason)),
    ];
    switch (storage) {
        case DpStorage.AlreadyStored: {
            lines.push(
                'not stored: an identical row already exists for this snapshot, config key and solver version',
            );
            break;
        }
        case DpStorage.NotRequested: {
            break;
        }
        case DpStorage.Stored: {
            lines.push('stored in your DP advice history');
            break;
        }
    }
    return lines;
}

async function dpStoreSinkFor(
    database: PropDatabase,
    userId: string,
): Promise<DpStoreSink> {
    const { DpAdviceRepo } = await import('~/lib/prop-accounts/server');
    const repo = new DpAdviceRepo(database, userId);
    const known = new Map<string, Promise<ReadonlySet<string>>>();
    const keysOf = (accountId: string): Promise<ReadonlySet<string>> => {
        let pending = known.get(accountId);
        if (pending === undefined) {
            pending = storedKeysOf(repo, accountId);
            known.set(accountId, pending);
        }
        return pending;
    };
    return {
        async isStored(target, configKey, solverVersion) {
            const keys = await keysOf(target.accountId);
            return keys.has(
                storedKey(target.snapshotId, configKey, solverVersion),
            );
        },
        async record(target, row, values) {
            const stored = await repo.record(
                target.accountId,
                row,
                values === null ? [] : dpValueSamplesOf(values),
            );
            return stored === null ? DpStorage.AlreadyStored : DpStorage.Stored;
        },
    };
}

function flagsPresent(rawArgs: readonly string[]): ReadonlySet<string> {
    return new Set(
        rawArgs
            .filter((token) => token.startsWith('--') && token.length > 2)
            .map((token) => token.slice(2).split('=', 1)[0] ?? ''),
    );
}

async function loadDpDatabaseTargets(input: {
    readonly accountId: null | string;
    readonly database: PropDatabase;
    readonly settings: DpSettings;
    readonly store: boolean;
    readonly today: string;
    readonly userId: string;
}): Promise<readonly DpTargetLoad[]> {
    const { accountId, database, settings, store, today, userId } = input;
    const { PropAccountRepo } = await import('~/lib/prop-accounts/server');
    const repo = new PropAccountRepo(database, userId);
    if (accountId !== null) await repo.loadOwnedAccountOrThrow(accountId);
    const [accounts, events, payouts, snapshots, storedRulebook] =
        await Promise.all([
            repo.listAccounts({ includeArchived: true }),
            repo.listEvents({ from: '0000-01-01', to: '9999-12-31' }),
            repo.listPayouts(),
            repo.latestTwoSnapshots(),
            repo.loadRulebookParameters(),
        ]);
    const rulebook = storedRulebook ?? DEFAULT_RULEBOOK;
    const states = accountStatesOf(userId, today, {
        accounts: accounts.map((account) => ({
            ...account,
            personalRules: account.personalRules ?? undefined,
        })),
        events,
        liveCushionPercent: rulebook.live.cushionPercent,
        payouts,
        snapshots,
    });
    const selected = accounts.filter((account) =>
        accountId === null
            ? account.archivedAt === null
            : account.id === accountId,
    );
    const loads: DpTargetLoad[] = [];
    for (const account of selected) {
        const label = account.label;
        if (
            account.status !== AccountStatus.Active &&
            account.status !== AccountStatus.Suspended
        ) {
            loads.push(skippedLoad(label, DpSkipReason.NotActive));
            continue;
        }
        const entry = states.find((state) => state.accountId === account.id);
        if (entry === undefined) {
            loads.push(
                skippedLoad(label, DpSkipReason.StateUnavailable, 'archived'),
            );
            continue;
        }
        if (entry.state.kind === AccountStateKind.Unavailable) {
            loads.push(
                skippedLoad(
                    label,
                    DpSkipReason.StateUnavailable,
                    entry.state.reason.kind,
                ),
            );
            continue;
        }
        const { latest } = entry.state;
        const { reconstructed } = latest;
        const labelled = `${label} (${entry.state.plan.label})`;
        if (reconstructed.kind === ReconstructedLiveKind.Live) {
            loads.push(skippedLoad(labelled, DpSkipReason.LiveNotModeled));
            continue;
        }
        const newest = latestTwoSnapshots(
            snapshots.filter(
                (snapshot) =>
                    snapshot.accountId === account.id &&
                    snapshot.userId === userId,
            ),
        ).latest;
        if (newest === null) {
            loads.push(
                skippedLoad(
                    labelled,
                    DpSkipReason.StateUnavailable,
                    'no-snapshot',
                ),
            );
            continue;
        }
        const owned = await repo.loadOwnedSnapshotOrThrow(
            newest.id,
            account.id,
        );
        const personalRules: null | PersonalRules = account.personalRules;
        const options = databaseAdvisorOptions({
            accountStatus: account.status,
            asOf: latest.asOf,
            personalRules,
            plan: reconstructed.plan,
            rulebook,
            settings,
            today,
        });
        loads.push({
            label: labelled,
            skip: null,
            target: {
                account: reconstructed,
                accountPolicy: options.accountPolicy,
                documented: documentedSizingOf(reconstructed, options),
                label: labelled,
                optIns: account.optIns,
                personalPayoutRequest:
                    optionalDollars(
                        personalRules?.payoutRequestOverrideCents,
                    ) ?? null,
                personalRetainedCushion:
                    optionalDollars(personalRules?.retainedCushionCents) ??
                    null,
                rulebook,
                store: store
                    ? { accountId: account.id, snapshotId: owned.id }
                    : null,
            },
        });
    }
    return loads;
}

function readDpSettings(arguments_: DpSettingsArguments): DpSettings {
    const stopPoints = arguments_['stop-points'];
    const rebuyLag = arguments_['rebuy-lag-days'];
    const startRate = arguments_['start-rate'];
    const workers = arguments_.workers;
    return {
        commission: readNonNegativeNumber(arguments_.commission, 'commission'),
        copyAccounts: readPositiveInteger(
            arguments_['copy-accounts'],
            'copy-accounts',
        ),
        evalGrid: {
            ...optionalMultiple(
                'actionStep',
                arguments_['action-step-multiple'],
                'action-step-multiple',
            ),
            ...optionalMultiple(
                'cushionStep',
                arguments_['cushion-step-multiple'],
                'cushion-step-multiple',
            ),
            ...optionalMultiple(
                'maxAction',
                arguments_['max-action-multiple'],
                'max-action-multiple',
            ),
        },
        fundedGrid: {
            ...optionalMultiple(
                'actionStepMultiple',
                arguments_['action-step-multiple'],
                'action-step-multiple',
            ),
            ...optionalMultiple(
                'cushionStepMultiple',
                arguments_['cushion-step-multiple'],
                'cushion-step-multiple',
            ),
            ...optionalMultiple(
                'maxActionMultiple',
                arguments_['max-action-multiple'],
                'max-action-multiple',
            ),
            ...optionalMultiple(
                'maxCushionMultiple',
                arguments_['max-cushion-multiple'],
                'max-cushion-multiple',
            ),
            ...optionalMultiple(
                'maxTailCushionMultiple',
                arguments_['max-tail-cushion-multiple'],
                'max-tail-cushion-multiple',
            ),
            ...optionalMultiple(
                'tailCushionStepMultiple',
                arguments_['tail-cushion-step-multiple'],
                'tail-cushion-step-multiple',
            ),
        },
        fundedHorizonDays: readPositiveInteger(
            arguments_['funded-days'],
            'funded-days',
        ),
        maxEvalDays: readPositiveInteger(arguments_['eval-days'], 'eval-days'),
        maxSolves: readPositiveInteger(arguments_.iterations, 'iterations'),
        maxWorkers:
            workers === undefined
                ? undefined
                : readPositiveInteger(workers, 'workers'),
        measuredRebuyLag:
            rebuyLag === undefined
                ? null
                : {
                      days: readNonNegativeNumber(rebuyLag, 'rebuy-lag-days'),
                      samples: 1,
                  },
        positionSizing:
            stopPoints === undefined
                ? null
                : {
                      instrument: arguments_.instrument,
                      stopPoints: readPositiveNumber(stopPoints, 'stop-points'),
                  },
        startRatePerDay:
            startRate === undefined
                ? null
                : readNonNegativeNumber(startRate, 'start-rate'),
        valuesOutput: valuesOutputOf(arguments_),
    };
}

async function runDpAdvice(input: DpRunInput): Promise<void> {
    const { budget, emit, settings, sink, targets } = input;
    const clock = input.clock ?? Date.now;
    const solver = input.solver ?? solveAverageRewardPolicy;
    const deadline =
        budget.timeBudgetMs === null ? null : clock() + budget.timeBudgetMs;
    const planned: DpPlanned[] = [];
    for (const load of targets) {
        if (load.target === null) {
            emit(load.label, skipOutcome(load.skip));
            continue;
        }
        const item = await plannedFor(load.target, settings);
        const skip = preflightSkip(item);
        if (skip !== null) {
            emit(load.label, skipOutcome(skip));
            continue;
        }
        planned.push(item);
    }
    let solves = 0;
    for (const group of groupsOf(planned)) {
        const [first] = group.members;
        if (first === undefined) continue;
        if (!first.eligibility.eligible) {
            await finishGroup(group, null, emit, sink, settings);
            continue;
        }
        const pendingMembers = await notYetStored(group, sink);
        const pendingSet = new Set(pendingMembers);
        for (const member of group.members) {
            if (!pendingSet.has(member)) {
                emit(
                    member.target.label,
                    skipOutcome({
                        detail: null,
                        reason: DpSkipReason.AlreadyStored,
                    }),
                );
            }
        }
        if (pendingMembers.length === 0) continue;
        const isExhausted =
            (budget.maxPlans !== null && solves >= budget.maxPlans) ||
            (deadline !== null && clock() >= deadline);
        if (isExhausted) {
            for (const member of pendingMembers) {
                emit(
                    member.target.label,
                    skipOutcome({
                        detail: null,
                        reason: DpSkipReason.BudgetExhausted,
                    }),
                );
            }
            continue;
        }
        solves += 1;
        try {
            await solveGroup(pendingMembers, input, solver);
        } catch (error) {
            for (const member of pendingMembers) {
                emit(
                    member.target.label,
                    skipOutcome({
                        detail:
                            error instanceof Error
                                ? error.message
                                : String(error),
                        reason: DpSkipReason.Failed,
                    }),
                );
            }
        }
    }
}

const consoleReporter: DpReporter = (() => {
    let spinner: ReturnType<typeof ui.spinner> | undefined;
    return {
        emit(label, outcome) {
            ui.heading(label);
            for (const line of dpOutcomeLines(label, outcome)) {
                ui.note(line);
            }
            if (
                outcome.kind === DpOutcomeKind.Skipped &&
                (outcome.reason === DpSkipReason.Failed ||
                    outcome.reason === DpSkipReason.SolveNotConverged)
            ) {
                process.exitCode = 1;
            }
        },
        solveFinished() {
            spinner?.stop();
            spinner = undefined;
        },
        solveStarted(label) {
            spinner = ui.spinner(`solving average-reward DP for ${label}`);
            spinner.start();
        },
    };
})();

function chainSpecOf(
    target: DpTarget,
    settings: DpSettings,
): DocumentedPolicySpec {
    const { personalRetainedCushion } = target;
    const { positionSizing } = settings;
    const { policy } = buildEnginePolicy({
        accountPolicy: target.accountPolicy,
        fundedHorizonDays: settings.fundedHorizonDays,
        measuredRebuyLag: settings.measuredRebuyLag,
        ...(personalRetainedCushion !== null && {
            personalRetainedCushion: dollars(personalRetainedCushion),
        }),
        plan: target.account.plan,
        positionSizing:
            positionSizing === null
                ? null
                : {
                      instrument: positionSizing.instrument,
                      stopPoints: points(positionSizing.stopPoints),
                  },
        rulebook: target.rulebook,
    });
    return {
        enginePolicy: {
            ...policy,
            commissionPerRoundTrip: settings.commission,
            payoutRequestOverride: target.personalPayoutRequest,
        },
        rulebook: target.rulebook,
        run: {
            maxEvalDays: settings.maxEvalDays,
            seed: FUNDED_SWEEP_DEFAULT_SEED,
            trials: FUNDED_SWEEP_DEFAULT_SIMS,
        },
    };
}

function checkConverged(solution: DpSolverOutput): null | string {
    const unconverged = solution.fundedResult.unconvergedLevelCount;
    const parts = [
        ...(solution.status === RateSearchStatus.Converged
            ? []
            : [`rate search ${solution.status}`]),
        ...(unconverged > 0
            ? [
                  `${unconverged} unconverged funded level${unconverged === 1 ? '' : 's'}`,
              ]
            : []),
    ];
    return parts.length === 0 ? null : parts.join(', ');
}

function databaseAdvisorOptions(input: {
    readonly accountStatus: AccountStatus;
    readonly asOf: string;
    readonly personalRules: null | PersonalRules;
    readonly plan: Plan;
    readonly rulebook: RulebookParameters;
    readonly settings: DpSettings;
    readonly today: string;
}): SizingAdvisorCreateOptions {
    const { personalRules, plan, settings } = input;
    return {
        accountPolicy: findFirm(plan.id.firm)?.accountPolicy,
        measuredRebuyLag: settings.measuredRebuyLag,
        paidPayoutsSinceLastLiveAccount: null,
        personalCaps: {
            dailyProfitCap:
                optionalDollars(personalRules?.dailyProfitCapCents) ?? null,
            maxRiskPerTrade: personalMaxRiskOf(personalRules),
            maxTradesPerDay: personalRules?.maxTradesPerDay ?? null,
        },
        personalDll:
            optionalDollars(personalRules?.dailyLossLimitCents) ?? null,
        personalPayoutOverride:
            optionalDollars(personalRules?.payoutRequestOverrideCents) ?? null,
        personalRetainedCushion:
            optionalDollars(personalRules?.retainedCushionCents) ?? null,
        positionSizing: settings.positionSizing,
        rulebook: input.rulebook,
        snapshotAsOf: input.asOf,
        substate: accountSubstateOf(input.accountStatus),
        today: input.today,
    };
}

function documentedRungOf(target: DpTarget): null | number {
    return target.documented?.rungs[0]?.risk ?? null;
}

function documentedSizingOf(
    account: ReconstructedAccount,
    options: SizingAdvisorCreateOptions,
): DocumentedSizing | null {
    try {
        return createSizingAdvisor(account, options).assemble([]).documented;
    } catch (error) {
        if (error instanceof InstantFundedEvalAdvisorError) return null;
        throw error;
    }
}

function dpModeOf(accountId: null | string, isAll: boolean): DpRunMode {
    if (accountId !== null) return DpRunMode.Account;
    return isAll ? DpRunMode.AllAccounts : DpRunMode.Snapshot;
}

function dpValueText(value: DpValueCents): string {
    const adjusted = `${dpMoney(value.rateAdjustedCents)} net of the rate`;
    return value.rateZeroCashCents === null
        ? adjusted
        : `${dpMoney(value.rateZeroCashCents)} cash, ${adjusted}`;
}

function evalGridOf(
    multiples: DpEvalGridMultiples,
    plan: Plan,
): DpSolveConfig['evalGrid'] {
    const drawdown = plan.drawdownFor(TradingPhase.Eval).amount;
    return {
        ...(multiples.actionStep !== undefined && {
            actionStepDollars: multiples.actionStep * drawdown,
        }),
        ...(multiples.cushionStep !== undefined && {
            cushionStepDollars: multiples.cushionStep * drawdown,
        }),
        ...(multiples.maxAction !== undefined && {
            maxActionDollars: multiples.maxAction * drawdown,
        }),
    };
}

async function finishGroup(
    group: DpGroup,
    solved: null | {
        readonly runtimeMs: number;
        readonly solution: DpSolverOutput;
    },
    emit: DpRunInput['emit'],
    sink: DpStoreSink | null,
    settings: DpSettings,
): Promise<void> {
    for (const member of group.members) {
        try {
            emit(
                member.target.label,
                await outcomeFor(member, solved, sink, settings),
            );
        } catch (error) {
            emit(
                member.target.label,
                skipOutcome({
                    detail:
                        error instanceof Error ? error.message : String(error),
                    reason: DpSkipReason.Failed,
                }),
            );
        }
    }
}

function flagList(flags: readonly string[]): string {
    return flags.map((flag) => `--${flag}`).join(', ');
}

function gapLines(gaps: readonly DpAdviceGapEntry[], plan: Plan): string[] {
    const texts = gaps.map((gap) => gapText(gap));
    const modelGapWarning = texts.includes(null)
        ? fundedDpModelGapWarning(plan)
        : null;
    return [
        ...(modelGapWarning === null ? [] : [`gap: ${modelGapWarning}`]),
        ...texts.filter((text) => text !== null),
    ];
}

function gapText(gap: DpAdviceGapEntry): null | string {
    return isFundedDpModelGap(gap) ? null : `gap: ${dpOwnGapText(gap)}`;
}

function groupsOf(planned: readonly DpPlanned[]): DpGroup[] {
    const groups: { members: DpPlanned[] }[] = [];
    const byKey = new Map<string, { members: DpPlanned[] }>();
    for (const item of planned) {
        if (!item.eligibility.eligible) {
            groups.push({ members: [item] });
            continue;
        }
        const key = dpConfigKey(item.config);
        const existing = byKey.get(key);
        if (existing === undefined) {
            const group = { members: [item] };
            byKey.set(key, group);
            groups.push(group);
        } else {
            existing.members.push(item);
        }
    }
    return groups;
}

async function notYetStored(
    group: DpGroup,
    sink: DpStoreSink | null,
): Promise<DpPlanned[]> {
    if (sink === null) return [...group.members];
    const pending: DpPlanned[] = [];
    for (const member of group.members) {
        const { store } = member.target;
        const isStored =
            store !== null &&
            (await sink.isStored(
                store,
                dpConfigKey(member.config),
                DP_ADVICE_SOLVER_VERSION,
            ));
        if (!isStored) pending.push(member);
    }
    return pending;
}

function offsetLine(offset: number, samples: readonly DpRiskSample[]): string {
    const [first] = samples;
    const where =
        offset === 0
            ? 'your state'
            : `${offset > 0 ? '+' : ''}${offset} documented rungs`;
    const risks = samples
        .map((sample) =>
            sample.placedRiskCents === null
                ? dpMoney(sample.riskCents)
                : `${dpMoney(sample.riskCents)} (placed ${dpMoney(sample.placedRiskCents)})`,
        )
        .join(' / ');
    return `  ${where}, cushion ${dpMoney(first?.cushionCents ?? 0)}: ${risks}`;
}

function optionalMultiple<Key extends string>(
    key: Key,
    raw: string | undefined,
    flag: string,
): Partial<Record<Key, number>> {
    return raw === undefined
        ? {}
        : ({ [key]: readPositiveNumber(raw, flag) } as Record<Key, number>);
}

async function outcomeFor(
    member: DpPlanned,
    solved: null | {
        readonly runtimeMs: number;
        readonly solution: DpSolverOutput;
    },
    sink: DpStoreSink | null,
    settings: DpSettings,
): Promise<DpOutcome> {
    const { config, eligibility, target } = member;
    const { plan } = target.account;
    const stage = dpSampleStageOf(target.account);
    const { valuesOutput } = settings;
    if (!eligibility.eligible) {
        const advice = ineligibleDpAdvice({
            config,
            reason: eligibility.reason,
            stage,
        });
        return {
            advice,
            kind: DpOutcomeKind.Advised,
            plan,
            runtimeMs: 0,
            storage: await storeRow(target, sink, {
                advice,
                config,
                ineligibleReason: eligibility.reason,
                runtimeMs: 0,
                values: null,
            }),
            values: null,
            valuesOutput,
        };
    }
    if (solved === null) {
        throw new Error('an eligible plan reached the outcome without a solve');
    }
    const rungDollars = documentedRungOf(target);
    if (rungDollars === null || target.documented === null) {
        throw new Error(
            'an eligible plan reached the outcome without a documented rung',
        );
    }
    const advice = dpAdviceFor({
        account: target.account,
        accountPolicy: target.accountPolicy,
        config,
        documentedPeakRisk: documentedPeakRiskOf(target.documented),
        documentedRungDollars: rungDollars,
        solution: solved.solution,
        validation: dpValidationFor(config.planSerial),
    });
    const isStoring = sink !== null && target.store !== null;
    const values =
        !isStoring && valuesOutput === DpValuesOutput.Hidden
            ? null
            : dpStateValuesOf({
                  account: target.account,
                  chainSpec: chainSpecOf(target, settings),
                  documentedRungDollars: rungDollars,
                  solution: solved.solution,
              });
    return {
        advice,
        kind: DpOutcomeKind.Advised,
        plan,
        runtimeMs: solved.runtimeMs,
        storage: await storeRow(target, sink, {
            advice,
            config,
            ineligibleReason: null,
            runtimeMs: Math.round(solved.runtimeMs),
            values,
        }),
        values,
        valuesOutput,
    };
}

async function plannedFor(
    target: DpTarget,
    settings: DpSettings,
): Promise<DpPlanned> {
    const { plan } = target.account;
    const { rulebook } = target;
    const config = dpSolveConfigFor({
        commission: settings.commission,
        copyAccounts: settings.copyAccounts,
        discounts: null,
        evalGrid: evalGridOf(settings.evalGrid, plan),
        fundedGrid: settings.fundedGrid,
        fundedHorizonDays: settings.fundedHorizonDays,
        lifetimePayoutCapOverride: null,
        maxEvalDays: settings.maxEvalDays,
        maxSolves: settings.maxSolves,
        objective: SizingObjective.MonthlyNet,
        optIns: target.optIns,
        personalPayoutRequest: target.personalPayoutRequest,
        personalRetainedCushion: target.personalRetainedCushion ?? undefined,
        plan,
        planRulesFingerprint: await planRulesFingerprint(plan),
        positionSizing: settings.positionSizing,
        rateTolerancePerDay: null,
        rebuyLagDays: settings.measuredRebuyLag?.days ?? 0,
        rrRatio: rulebook.strategy.rr,
        rulebook,
        startRatePerDay: settings.startRatePerDay,
        tradesPerDay: rulebook.strategy.tradesPerDayMax,
        winrate: rulebook.strategy.winrate,
    });
    return { config, eligibility: dpEligibility(plan), target };
}

function preflightSkip(item: DpPlanned): DpSkip | null {
    if (!item.eligibility.eligible) return null;
    if (documentedRungOf(item.target) === null) {
        return { detail: null, reason: DpSkipReason.NoDocumentedSizing };
    }
    if (dpSampleStageOf(item.target.account) !== DpSampleStage.Eval) {
        return null;
    }
    const validation = dpValidationFor(item.config.planSerial);
    return validation.validated
        ? null
        : {
              detail: DP_GATE_FAILURE_TEXT[validation.failure],
              reason: DpSkipReason.EvalNotValidated,
          };
}

function readAccountId(raw: string | undefined): null | string {
    if (raw === undefined) return null;
    const parsed = z.uuid().safeParse(raw.trim());
    if (!parsed.success) {
        throw new Error(`--account must be an account id (UUID), got "${raw}"`);
    }
    return parsed.data;
}

function requireNone(flags: readonly string[], reason: string): void {
    if (flags.length > 0) throw new Error(`${flagList(flags)} ${reason}`);
}

function sampleLines(advice: DpAdvice): string[] {
    const { samples } = advice;
    if (samples.kind === DpSamplesKind.Unavailable) {
        return [
            `DP sizing: not shown, ${DP_SAMPLES_UNAVAILABLE_TEXT[samples.reason]}`,
        ];
    }
    const offsets = [
        ...new Set(samples.samples.map((sample) => sample.rungOffset)),
    ].toSorted((a, b) => a - b);
    return [
        `DP risk per trade (${samples.stage === DpSampleStage.Eval ? 'eval' : 'funded'}, after each loss in order):`,
        ...offsets.map((offset) =>
            offsetLine(
                offset,
                samples.samples.filter(
                    (sample) => sample.rungOffset === offset,
                ),
            ),
        ),
    ];
}

function skipOutcome(skip: DpSkip): DpOutcome {
    return { ...skip, kind: DpOutcomeKind.Skipped };
}

function skippedLoad(
    label: string,
    reason: DpSkipReason,
    detail: null | string = null,
): DpTargetLoad {
    return { label, skip: { detail, reason }, target: null };
}

async function solveGroup(
    pending: readonly DpPlanned[],
    input: DpRunInput,
    solver: DpSolver,
): Promise<void> {
    const [first] = pending;
    if (first === undefined) return;
    const { emit, settings, sink } = input;
    const started = performance.now();
    const solution = solver(
        buildDpSolverCall(
            first.config,
            solverPlanOf(first.target.account.plan, first.target.optIns),
            { maxWorkers: settings.maxWorkers },
        ),
    );
    const runtimeMs = performance.now() - started;
    const unconverged = checkConverged(solution);
    if (unconverged !== null) {
        for (const member of pending) {
            emit(
                member.target.label,
                skipOutcome({
                    detail: unconverged,
                    reason: DpSkipReason.SolveNotConverged,
                }),
            );
        }
        return;
    }
    await finishGroup(
        { members: pending },
        { runtimeMs, solution },
        emit,
        sink,
        settings,
    );
}

function solverPlanOf(plan: Plan, optIns: PlanOptIns): Plan {
    const base = findFirm(plan.id.firm)?.findPlanBySerial(
        serializePlanId(plan.id),
    );
    if (base === null || base === undefined) {
        throw new Error(`${plan.label} is not a registered plan`);
    }
    return withRegistryPlanOptIns(base, optIns);
}

function storedKey(
    snapshotId: string,
    configKey: string,
    solverVersion: number,
): string {
    return `${snapshotId}|${configKey}|${solverVersion}`;
}

async function storedKeysOf(
    repo: DpAdviceRepo,
    accountId: string,
): Promise<ReadonlySet<string>> {
    const records = await repo.listForAccount(accountId);
    return new Set(
        records.map((record) =>
            storedKey(
                record.snapshotId,
                record.configKey,
                record.solverVersion,
            ),
        ),
    );
}

async function storeRow(
    target: DpTarget,
    sink: DpStoreSink | null,
    input: {
        readonly advice: DpAdvice;
        readonly config: DpSolveConfig;
        readonly ineligibleReason: null | string;
        readonly runtimeMs: number;
        readonly values: DpStateValues | null;
    },
): Promise<DpStorage> {
    const { store } = target;
    if (sink === null || store === null) return DpStorage.NotRequested;
    const { advice, config, values } = input;
    const assumedSizing =
        input.ineligibleReason === null ? config.positionSizing : null;
    return sink.record(
        store,
        {
            assumedInstrument: assumedSizing?.instrument ?? null,
            assumedStopPoints: assumedSizing?.stopPoints ?? null,
            configKey: advice.configKey,
            eligible: input.ineligibleReason === null,
            gaps: advice.gaps,
            gateFailure:
                advice.notValidated === null
                    ? null
                    : advice.notValidated.failure,
            gateResult: advice.notValidated?.result ?? null,
            ineligibleReason: input.ineligibleReason,
            objective: advice.objective,
            planRulesFingerprint: config.planRulesFingerprint,
            planSerial: config.planSerial,
            runtimeMs: input.runtimeMs,
            samples: advice.samples,
            snapshotId: store.snapshotId,
            solvedAt: new Date().toISOString(),
            solverVersion: advice.solverVersion,
            validated: advice.validated,
            validationRef: advice.validationRef,
        },
        values,
    );
}

function tradeValueText(trade: DpTradeValueCents): string {
    return `after a win ${dpValueText(trade.afterWin)}; after a loss ${dpValueText(trade.afterLoss)}; expected ${dpValueText(trade.expected)}`;
}

function validationLine(advice: DpAdvice): string {
    const { notValidated } = advice;
    if (notValidated === null) {
        return `DP validated by ${advice.validationRef ?? 'a recorded gate run'}`;
    }
    const { citation } = notValidated;
    const cited =
        citation === null
            ? ''
            : ` (${citation.file}, row "${citation.row}", ${citation.date})`;
    const failure = dpGateFailureText(
        notValidated.failure,
        notValidated.result,
    );
    return `DP not validated: ${failure}${cited}. Treat these figures as an unvalidated estimate, never as the sizing rule`;
}

function valueLines(
    values: DpStateValues | null,
    output: DpValuesOutput,
): string[] {
    if (values === null || output === DpValuesOutput.Hidden) return [];
    const rate = dpMoney(values.ratePerDayCents);
    const stage = values.stage === DpSampleStage.Eval ? 'eval' : 'funded';
    const chain = values.chain.map((entry) =>
        'value' in entry
            ? `${VALUE_CHAIN_STEP_LABEL[entry.kind]}: ${dpValueText(entry.value)}`
            : `${VALUE_CHAIN_STEP_LABEL[entry.kind]}: not available, ${entry.reason}`,
    );
    const heading = `DP values (${stage}, solved rate ${rate} a day; cash is the expected cash with no charge for time, net of the rate subtracts ${rate} for every day):`;
    if (values.state.kind === DpStateValuesKind.Unavailable) {
        return [
            heading,
            `Your state: not shown, ${DP_SAMPLES_UNAVAILABLE_TEXT[values.state.reason]}`,
            ...chain,
        ];
    }
    const { report } = values.state;
    const rung = report.documentedRung;
    return [
        heading,
        `Your state: ${dpValueText(report.value)}; the DP's next risk ${dpMoney(report.bestRiskCents)}; no trade now ${dpValueText(report.noTrade)}`,
        ...(report.isBeyondGrid
            ? [
                  'Your state is at or above the top of the DP grid, so these values are read at the grid edge',
              ]
            : []),
        ...(rung === null
            ? []
            : [
                  `Your documented rung ${dpMoney(rung.intendedRiskCents)} (placed ${dpMoney(rung.riskCents)}): ${tradeValueText(rung)}`,
              ]),
        ...chain,
        ...(output === DpValuesOutput.Candidates
            ? report.candidates.map(
                  (candidate) =>
                      `Candidate risk ${dpMoney(candidate.riskCents)}: ${tradeValueText(candidate)}`,
              )
            : []),
    ];
}

function valuesOutputOf(arguments_: AdviseDpArguments): DpValuesOutput {
    if (arguments_.candidates === true) return DpValuesOutput.Candidates;
    return arguments_.values === true
        ? DpValuesOutput.Values
        : DpValuesOutput.Hidden;
}
