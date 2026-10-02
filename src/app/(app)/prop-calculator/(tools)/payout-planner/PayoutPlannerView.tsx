'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { DEFAULT_FUNDED_HORIZON_DAYS } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { ComputationId } from '~/app/(app)/prop-calculator/_components/ComputationId';
import FirmPlanPicker from '~/app/(app)/prop-calculator/_components/FirmPlanPicker';
import { PanelSkeleton } from '~/app/(app)/prop-calculator/_components/PanelSkeleton';
import {
    payoutBlockReasonText,
    payoutFirmMinimumMessage,
    payoutPathStepText,
    type PayoutPlannerAccountInput,
    PayoutPlannerResultKind,
    planPayoutReadiness,
    simStayCeilingText,
} from '~/app/(app)/prop-calculator/_components/payoutPlanner/payoutPlannerModel';
import {
    decodePayoutPlannerUrlState,
    encodePayoutPlannerUrlState,
    parsePayoutPlannerBalance,
    parsePayoutPlannerCount,
    parsePayoutPlannerDate,
    parsePayoutPlannerOptionalDollars,
    type PayoutPlannerUrlState,
} from '~/app/(app)/prop-calculator/_components/payoutPlanner/payoutPlannerUrlState';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { ToolPageHeading } from '~/app/(app)/prop-calculator/_components/ToolPageHeading';
import {
    type CachedWorkerJob,
    useCachedWorkerTask,
} from '~/app/(app)/prop-calculator/_components/useCachedWorkerTask';
import { SIM_DEBOUNCE_MS } from '~/app/(app)/prop-calculator/_components/useCalculator';
import {
    WorkerTaskPhase,
    type WorkerTaskState,
} from '~/app/(app)/prop-calculator/_components/workerTaskState';
import {
    payoutOutlookCacheKey,
    type PayoutOutlookRequest,
    type PayoutOutlookResult,
    payoutSweepCacheKey,
    type PayoutSweepRequest,
    type PayoutSweepResult,
} from '~/app/(app)/prop-calculator/_workers/payoutSweepWorkerMessages';
import { type AssumptionView } from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceViewModel';
import { AssumptionsList } from '~/app/(app)/prop-calculator/accounts/_components/advice/AssumptionsList';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { useSession } from '~/lib/auth/client';
import { formatGateCurrency, formatPercent } from '~/lib/format';
import {
    ALL_FIRMS,
    CENTS_PER_DOLLAR,
    DrawdownKind,
    effectivePayoutRequest,
    type Plan,
    serializePlanId,
    todayIsoDate,
} from '~/lib/prop-calculator';
import {
    type Assumption,
    AssumptionBias,
    assumptionText,
    buildEnginePolicy,
    DEFAULT_MAX_EVAL_DAYS,
    DEFAULT_RULEBOOK,
    type DocumentedPolicySpec,
    HARD_RULE_2_MIN_RETAINED_CUSHION_DOLLARS,
    NEXT_PAYOUT_AMONG_PAYING_TEXT,
    NEXT_PAYOUT_ELIGIBLE_NOW_TEXT,
    NEXT_PAYOUT_NO_TRIAL_PAID_TEXT,
    nextPayoutEvidenceText,
    type NextPayoutProjection,
    NextPayoutTimingKind,
    nextPayoutTimingOf,
    type PayoutSizeSweepOptimum,
    PayoutSizeSweepResultKind,
    type PayoutSizeSweepRow,
    RetainedCushionBasis,
    type RulebookParameters,
    StartBasis,
} from '~/lib/prop-calculator/advisor';
import {
    conservativeGapStandardError,
    type PayoutStakeComparisonOutcome,
    type ValueNotModeledResult,
    ValueResultKind,
    ValueUnavailableReason,
} from '~/lib/prop-calculator/advisor/value';
import { noiseVerdict, NoiseVerdict } from '~/lib/prop-calculator/stats';
import { PayoutPlannerUrlParameter } from '~/lib/schemas/payoutPlannerUrlParameter';
import { api } from '~/trpc/react';

const INPUTS_HEADING_ID = 'payout-planner-inputs-heading';
const OUTLOOK_HEADING_ID = 'payout-planner-outlook-heading';
const READINESS_HEADING_ID = 'payout-planner-readiness-heading';
const SWEEP_HEADING_ID = 'payout-planner-sweep-heading';
const ASSUMPTIONS_HEADING_ID = 'payout-planner-assumptions-heading';
const FIX_FIELD_TEXT = 'Fix the highlighted field to see the readiness.';
const MID_SIZE_BAND_MIN = 1000;
const MID_SIZE_BAND_MAX = 2000;
const SWEEP_SEED = 42;
const SWEEP_TRIALS = 2000;
const PEAK_ASSUMED_VIEW: AssumptionView = {
    bias: AssumptionBias.Optimistic,
    text: 'No peak balance was entered, so the current balance is assumed to be the peak, the most generous trailing-drawdown state.',
};

enum RulebookStatus {
    Failed = 'failed',
    Loading = 'loading',
    Ready = 'ready',
}

const RULEBOOK_NOTICE_TEXT: Readonly<
    Record<RulebookStatus.Failed | RulebookStatus.Loading, string>
> = {
    [RulebookStatus.Failed]:
        'Your rulebook could not be loaded, so no payout figures are shown.',
    [RulebookStatus.Loading]: 'Loading your rulebook.',
};

const RETAINED_CUSHION_BASIS_TEXT: Readonly<
    Record<RetainedCushionBasis, string>
> = {
    [RetainedCushionBasis.HardRule2Default]: 'Hard Rule 2 minimum',
    [RetainedCushionBasis.LiveOneDrawdown]: 'one live drawdown',
    [RetainedCushionBasis.PersonalOverride]: 'personal override',
    [RetainedCushionBasis.RulebookSize]: 'rulebook size',
};

const NOISE_VERDICT_TEXT: Readonly<Record<NoiseVerdict, string>> = {
    [NoiseVerdict.BeyondNoise]: 'beyond simulation noise',
    [NoiseVerdict.Unknown]: 'noise level unknown',
    [NoiseVerdict.WithinNoise]:
        'within simulation noise: not a verdict on whether to request now',
};

const NOT_MODELED_TEXT: Readonly<Record<ValueUnavailableReason, string>> = {
    [ValueUnavailableReason.LiveNotModeled]:
        'Request now vs continue trading is not modeled for a live account.',
};

type FieldValidityChange = (
    field: PayoutPlannerUrlParameter,
    isValid: boolean,
) => void;

interface PayoutPolicy {
    readonly assumptions: readonly Assumption[];
    readonly spec: DocumentedPolicySpec;
}

type PayoutReadinessResult = ReturnType<typeof planPayoutReadiness>;

type RulebookState =
    | {
          readonly rulebook: RulebookParameters;
          readonly status: RulebookStatus.Ready;
      }
    | {
          readonly status: RulebookStatus.Failed | RulebookStatus.Loading;
      };

export function PayoutPlannerView() {
    const searchParameters = useSearchParams();
    const [state, setState] = useState(() =>
        decodePayoutPlannerUrlState(
            new URLSearchParams(searchParameters.toString()),
        ),
    );
    const [invalidFields, setInvalidFields] = useState<
        ReadonlySet<PayoutPlannerUrlParameter>
    >(() => new Set());
    const isInputValid = invalidFields.size === 0;
    const isRequestSizeValid = !invalidFields.has(
        PayoutPlannerUrlParameter.RequestSize,
    );
    const session = useSession();
    const hasSession = session.data?.user.id !== undefined;
    const rulebookQuery = api.propAccounts.rulebook.get.useQuery(undefined, {
        enabled: hasSession,
    });
    const rulebookState = rulebookStateOf({
        hasSession,
        isQueryFailed: rulebookQuery.isError,
        isSessionFailed: session.error !== null,
        isSessionPending: session.isPending,
        rulebook: rulebookQuery.data,
    });
    const rulebook =
        rulebookState.status === RulebookStatus.Ready
            ? rulebookState.rulebook
            : null;
    const asOf = todayIsoDate(new Date());

    const policy = useMemo(
        () => (rulebook === null ? null : policyFor(state.plan, rulebook)),
        [state.plan, rulebook],
    );
    const result = useMemo(
        () =>
            rulebook === null
                ? null
                : planPayoutReadiness(accountInputFor(state, rulebook, asOf)),
        [state, rulebook, asOf],
    );

    const sweepJob = useMemo((): CachedWorkerJob<PayoutSweepRequest> | null => {
        if (policy === null || !isRequestSizeValid) return null;
        const request = sweepRequestFor(
            state.plan,
            state.requestSize,
            policy.spec,
        );
        return { key: payoutSweepCacheKey(request), request };
    }, [policy, isRequestSizeValid, state.plan, state.requestSize]);
    const { state: sweepTask } = useCachedWorkerTask<
        ComputationId.PayoutSweep,
        PayoutSweepRequest
    >({
        createWorker: createPayoutWorker,
        debounceMs: SIM_DEBOUNCE_MS,
        id: ComputationId.PayoutSweep,
        job: sweepJob,
    });

    const outlookJob =
        useMemo((): CachedWorkerJob<PayoutOutlookRequest> | null => {
            if (
                !isInputValid ||
                policy === null ||
                result === null ||
                result.kind === PayoutPlannerResultKind.Implausible
            ) {
                return null;
            }
            const request = outlookRequestFor(
                state,
                policy.spec,
                result.kind === PayoutPlannerResultKind.Ready,
                asOf,
            );
            return { key: payoutOutlookCacheKey(request), request };
        }, [policy, result, isInputValid, state, asOf]);
    const { state: outlookTask } = useCachedWorkerTask<
        ComputationId.PayoutOutlook,
        PayoutOutlookRequest
    >({
        createWorker: createPayoutWorker,
        debounceMs: SIM_DEBOUNCE_MS,
        id: ComputationId.PayoutOutlook,
        job: outlookJob,
    });

    const changeValidity: FieldValidityChange = (field, isValid) => {
        setInvalidFields((current) => {
            if (current.has(field) !== isValid) return current;
            const next = new Set(current);
            if (isValid) next.delete(field);
            else next.add(field);
            return next;
        });
    };

    const change = (patch: Partial<PayoutPlannerUrlState>) => {
        setState((current) => ({ ...current, ...patch }));
    };

    return (
        <>
            <ToolPageHeading
                ownQuery={encodePayoutPlannerUrlState(state, [
                    ...invalidFields,
                ])}
                toolId={ToolId.PayoutPlanner}
            />
            <div className="app-prop-calculator__payout-planner mb-10 grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
                <section
                    aria-labelledby={INPUTS_HEADING_ID}
                    className="flex flex-col gap-4"
                >
                    <h2
                        className="text-lg font-semibold tracking-tight text-white"
                        id={INPUTS_HEADING_ID}
                    >
                        Account
                    </h2>
                    <PayoutPlannerInputs
                        onChange={change}
                        onValidityChange={changeValidity}
                        state={state}
                    />
                </section>
                <div className="flex flex-col gap-8">
                    <section
                        aria-labelledby={READINESS_HEADING_ID}
                        className="flex flex-col gap-4"
                    >
                        <h2
                            className="text-lg font-semibold tracking-tight text-white"
                            id={READINESS_HEADING_ID}
                        >
                            Readiness
                        </h2>
                        {rulebook === null || result === null ? (
                            <RulebookStatusNotice
                                status={noticeStatusOf(rulebookState)}
                            />
                        ) : isInputValid ? (
                            <PayoutPlannerReadinessSummary
                                isPeakAssumed={isPeakAssumed(state)}
                                result={result}
                            />
                        ) : (
                            <p className="text-sm text-amber-400">
                                {FIX_FIELD_TEXT}
                            </p>
                        )}
                    </section>
                    <section
                        aria-labelledby={OUTLOOK_HEADING_ID}
                        className="flex flex-col gap-4"
                    >
                        <h2
                            className="text-lg font-semibold tracking-tight text-white"
                            id={OUTLOOK_HEADING_ID}
                        >
                            Path to payout
                        </h2>
                        {result === null ? (
                            <RulebookStatusNotice
                                status={noticeStatusOf(rulebookState)}
                            />
                        ) : isInputValid ? (
                            <PayoutPlannerOutlookSection
                                outlookTask={outlookTask}
                                result={result}
                            />
                        ) : (
                            <p className="text-sm text-amber-400">
                                {FIX_FIELD_TEXT}
                            </p>
                        )}
                    </section>
                    <section
                        aria-labelledby={SWEEP_HEADING_ID}
                        className="flex flex-col gap-4"
                    >
                        <h2
                            className="text-lg font-semibold tracking-tight text-white"
                            id={SWEEP_HEADING_ID}
                        >
                            Payout-size sweep
                        </h2>
                        {rulebook === null ? (
                            <RulebookStatusNotice
                                status={noticeStatusOf(rulebookState)}
                            />
                        ) : isRequestSizeValid ? (
                            <PayoutSweepTable
                                documentedRequestDollars={
                                    rulebook.payout.requestCents /
                                    CENTS_PER_DOLLAR
                                }
                                enteredRequest={state.requestSize}
                                plan={state.plan}
                                task={sweepTask}
                            />
                        ) : (
                            <p className="text-sm text-amber-400">
                                {FIX_FIELD_TEXT}
                            </p>
                        )}
                    </section>
                    {policy === null ? null : (
                        <section
                            aria-labelledby={ASSUMPTIONS_HEADING_ID}
                            className="flex flex-col gap-3"
                        >
                            <h2
                                className="text-lg font-semibold tracking-tight text-white"
                                id={ASSUMPTIONS_HEADING_ID}
                            >
                                Assumptions
                            </h2>
                            <PayoutPlannerAssumptions
                                isPeakAssumed={isPeakAssumed(state)}
                                policy={policy}
                            />
                        </section>
                    )}
                </div>
            </div>
        </>
    );
}

function accountInputFor(
    state: PayoutPlannerUrlState,
    rulebook: RulebookParameters,
    asOf: string,
): PayoutPlannerAccountInput {
    return {
        asOf,
        balance: state.balance,
        floorAtLastPayout: state.floorAtLastPayout,
        lastPayoutOn: state.lastPayoutOn,
        payoutsTaken: state.payoutsTaken,
        peak: state.peak,
        plan: state.plan,
        qualifyingDaysSinceLastPayout: state.qualifyingDaysSinceLastPayout,
        requestSize: state.requestSize,
        rulebook,
    };
}

function assumptionViewOf(assumption: Assumption): AssumptionView {
    return {
        bias: assumption.bias,
        text: assumptionText(assumption),
    };
}

function createPayoutWorker(): Worker {
    return new Worker(
        new URL('../../_workers/payoutSweepWorker.ts', import.meta.url),
        { type: 'module' },
    );
}

function creditFreeOf(row: PayoutSizeSweepRow): number {
    return row.kind === StartBasis.Fresh
        ? row.out.expectedMonthlyRealizedNet
        : row.out.fromStateExpectedRealizedCash;
}

function creditInclusiveOf(row: PayoutSizeSweepRow): number {
    return row.kind === StartBasis.Fresh
        ? row.out.expectedMonthlyNet
        : row.out.fromStateExpectedCash;
}

function isNotModeled(
    outcome: PayoutStakeComparisonOutcome,
): outcome is ValueNotModeledResult {
    return outcome.kind === ValueResultKind.NotModeled;
}

function isPeakAssumed(state: PayoutPlannerUrlState): boolean {
    return (
        state.peak === null &&
        state.plan.fundedDrawdown.kind !== DrawdownKind.Static
    );
}

function midSizeNotes(
    documented: PayoutSizeSweepRow,
    winner: PayoutSizeSweepRow,
): string[] {
    const isMidSize = (row: PayoutSizeSweepRow) =>
        row.requestSize >= MID_SIZE_BAND_MIN &&
        row.requestSize <= MID_SIZE_BAND_MAX;
    return isMidSize(documented) || isMidSize(winner)
        ? [
              `Mid-size requests (${formatGateCurrency(MID_SIZE_BAND_MIN)} to ${formatGateCurrency(MID_SIZE_BAND_MAX)}) keep the balance pinned near the retained cushion and carried very high bust rates in the historical sweep.`,
          ]
        : [];
}

function nextPayoutDaysText(projection: NextPayoutProjection): string {
    const timing = nextPayoutTimingOf(projection);
    switch (timing.kind) {
        case NextPayoutTimingKind.AlreadyEligible: {
            return NEXT_PAYOUT_ELIGIBLE_NOW_TEXT;
        }
        case NextPayoutTimingKind.InDays: {
            const { standardError, value } = timing.calendarDays;
            return `${value.toFixed(1)} days${
                standardError === null ? '' : ` (±${standardError.toFixed(1)})`
            }`;
        }
        case NextPayoutTimingKind.NoTrialPaid: {
            return NEXT_PAYOUT_NO_TRIAL_PAID_TEXT;
        }
    }
}

function noticeStatusOf(
    rulebookState: RulebookState,
): RulebookStatus.Failed | RulebookStatus.Loading {
    return rulebookState.status === RulebookStatus.Ready
        ? RulebookStatus.Loading
        : rulebookState.status;
}

function outlookRequestFor(
    state: PayoutPlannerUrlState,
    spec: DocumentedPolicySpec,
    isEligible: boolean,
    asOf: string,
): PayoutOutlookRequest {
    return {
        asOf,
        balance: state.balance,
        firmId: state.plan.id.firm,
        floorAtLastPayout: state.floorAtLastPayout,
        isEligible,
        lastPayoutOn: state.lastPayoutOn,
        payoutsTaken: state.payoutsTaken,
        peak: state.peak,
        planSerial: serializePlanId(state.plan.id),
        qualifyingDaysSinceLastPayout: state.qualifyingDaysSinceLastPayout,
        requestSize: state.requestSize,
        spec,
    };
}

function PayoutPlannerAssumptions({
    isPeakAssumed: isPeakAssumedForState,
    policy,
}: {
    isPeakAssumed: boolean;
    policy: PayoutPolicy;
}) {
    const { funded, payout, strategy } = policy.spec.rulebook;
    const { fundedHorizonDays } = policy.spec.enginePolicy;
    const { seed, trials } = policy.spec.run;
    const views = [
        ...(isPeakAssumedForState ? [PEAK_ASSUMED_VIEW] : []),
        ...policy.assumptions.map(assumptionViewOf),
    ];
    return (
        <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
                Behind the readiness, the path and the sweep: funded risk{' '}
                {formatGateCurrency(funded.riskCents / CENTS_PER_DOLLAR)} and
                take profit{' '}
                {formatGateCurrency(funded.takeProfitCents / CENTS_PER_DOLLAR)}{' '}
                per trade, win rate {formatPercent(strategy.winrate)},
                reward-to-risk {strategy.rr}, up to {funded.tradesPerDayMax}{' '}
                trades a day, retained cushion{' '}
                {formatGateCurrency(
                    payout.retainedCushionCents / CENTS_PER_DOLLAR,
                )}
                , {trials} trials, seed {seed}, {fundedHorizonDays}-day funded
                horizon.
            </p>
            <AssumptionsList assumptions={views} />
        </div>
    );
}

function PayoutPlannerCountField({
    field,
    id,
    invalidText,
    label,
    onValid,
    onValidityChange,
    value,
}: {
    field: PayoutPlannerUrlParameter;
    id: string;
    invalidText: string;
    label: string;
    onValid: (value: number) => void;
    onValidityChange: FieldValidityChange;
    value: number;
}) {
    const [text, setText] = useState(() => String(value));
    const isInvalid = parsePayoutPlannerCount(text) === null;
    const hintId = `${id}-hint`;
    return (
        <div className="flex flex-col gap-1">
            <Label htmlFor={id}>{label}</Label>
            <Input
                aria-describedby={isInvalid ? hintId : undefined}
                aria-invalid={isInvalid}
                id={id}
                inputMode="numeric"
                onChange={(event) => {
                    setText(event.target.value);
                    const parsed = parsePayoutPlannerCount(event.target.value);
                    onValidityChange(field, parsed !== null);
                    if (parsed !== null) onValid(parsed);
                }}
                type="number"
                value={text}
            />
            {isInvalid ? (
                <p className="text-xs text-amber-400" id={hintId}>
                    {invalidText}
                </p>
            ) : null}
        </div>
    );
}

function PayoutPlannerDollarField<T extends number>({
    allowEmpty = false,
    field,
    id,
    invalidText,
    label,
    onValid,
    onValidityChange,
    parse,
    value,
}: {
    allowEmpty?: boolean;
    field: PayoutPlannerUrlParameter;
    id: string;
    invalidText: string;
    label: string;
    onValid: (value: null | T) => void;
    onValidityChange: FieldValidityChange;
    parse: (raw: string) => null | T;
    value: null | T;
}) {
    const [text, setText] = useState(() =>
        value === null ? '' : String(value),
    );
    const isEmpty = text.trim() === '';
    const isInvalid = !(allowEmpty && isEmpty) && parse(text) === null;
    const hintId = `${id}-hint`;
    return (
        <div className="flex flex-col gap-1">
            <Label htmlFor={id}>{label}</Label>
            <Input
                aria-describedby={isInvalid ? hintId : undefined}
                aria-invalid={isInvalid}
                id={id}
                inputMode="decimal"
                onChange={(event) => {
                    setText(event.target.value);
                    if (allowEmpty && event.target.value.trim() === '') {
                        onValidityChange(field, true);
                        onValid(null);
                        return;
                    }
                    const parsed = parse(event.target.value);
                    onValidityChange(field, parsed !== null);
                    if (parsed !== null) onValid(parsed);
                }}
                type="number"
                value={text}
            />
            {isInvalid ? (
                <p className="text-xs text-amber-400" id={hintId}>
                    {invalidText}
                </p>
            ) : null}
        </div>
    );
}

function PayoutPlannerInputs({
    onChange,
    onValidityChange,
    state,
}: {
    onChange: (patch: Partial<PayoutPlannerUrlState>) => void;
    onValidityChange: FieldValidityChange;
    state: PayoutPlannerUrlState;
}) {
    const firm = ALL_FIRMS.find((candidate) =>
        candidate.plans.includes(state.plan),
    );
    return (
        <div className="flex flex-col gap-4">
            {firm === undefined ? null : (
                <FirmPlanPicker
                    firm={firm}
                    firms={ALL_FIRMS}
                    onFirmChange={(next) => {
                        const [first] = next.plans;
                        if (first !== undefined) onChange({ plan: first });
                    }}
                    onPlanChange={(plan) => {
                        onChange({ plan });
                    }}
                    plan={state.plan}
                />
            )}
            <PayoutPlannerDollarField
                field={PayoutPlannerUrlParameter.Balance}
                id="payout-planner-balance"
                invalidText="Enter a positive balance in dollars."
                label="Balance ($)"
                onValid={(balance) => {
                    if (balance !== null) onChange({ balance });
                }}
                onValidityChange={onValidityChange}
                parse={parsePayoutPlannerBalance}
                value={state.balance}
            />
            <PayoutPlannerDollarField
                allowEmpty
                field={PayoutPlannerUrlParameter.Peak}
                id="payout-planner-peak"
                invalidText="Enter a positive peak balance in dollars, or leave it blank."
                label="Peak balance ($, optional)"
                onValid={(peak) => {
                    onChange({ peak });
                }}
                onValidityChange={onValidityChange}
                parse={parsePayoutPlannerOptionalDollars}
                value={state.peak}
            />
            <PayoutPlannerDollarField
                field={PayoutPlannerUrlParameter.RequestSize}
                id="payout-planner-request"
                invalidText="Enter a positive requested payout size in dollars."
                label="Requested payout size ($)"
                onValid={(requestSize) => {
                    if (requestSize !== null) onChange({ requestSize });
                }}
                onValidityChange={onValidityChange}
                parse={parsePayoutPlannerBalance}
                value={state.requestSize}
            />
            <div className="grid gap-4 sm:grid-cols-2">
                <PayoutPlannerCountField
                    field={PayoutPlannerUrlParameter.Payouts}
                    id="payout-planner-payouts-taken"
                    invalidText="Enter a whole number of payouts taken."
                    label="Payouts taken"
                    onValid={(payoutsTaken) => {
                        onChange({ payoutsTaken });
                    }}
                    onValidityChange={onValidityChange}
                    value={state.payoutsTaken}
                />
                <PayoutPlannerCountField
                    field={PayoutPlannerUrlParameter.QualifyingDays}
                    id="payout-planner-qualifying-days"
                    invalidText="Enter a whole number of qualifying days."
                    label="Qualifying days since last payout"
                    onValid={(qualifyingDaysSinceLastPayout) => {
                        onChange({ qualifyingDaysSinceLastPayout });
                    }}
                    onValidityChange={onValidityChange}
                    value={state.qualifyingDaysSinceLastPayout}
                />
            </div>
            <PayoutPlannerDollarField
                allowEmpty
                field={PayoutPlannerUrlParameter.FloorAtLastPayout}
                id="payout-planner-floor-at-last-payout"
                invalidText="Enter a positive floor balance in dollars, or leave it blank."
                label="Floor at the last payout ($, optional)"
                onValid={(floorAtLastPayout) => {
                    onChange({ floorAtLastPayout });
                }}
                onValidityChange={onValidityChange}
                parse={parsePayoutPlannerOptionalDollars}
                value={state.floorAtLastPayout}
            />
            <div className="flex flex-col gap-1">
                <Label htmlFor="payout-planner-last-payout-on">
                    Last payout date (optional)
                </Label>
                <Input
                    id="payout-planner-last-payout-on"
                    onChange={(event) => {
                        const lastPayoutOn = parsePayoutPlannerDate(
                            event.target.value,
                        );
                        onChange({ lastPayoutOn });
                    }}
                    type="date"
                    value={state.lastPayoutOn ?? ''}
                />
            </div>
        </div>
    );
}

function PayoutPlannerOutlookOffThread({
    task,
}: {
    task: WorkerTaskState<never, PayoutOutlookResult>;
}) {
    if (task.phase === WorkerTaskPhase.Failed) {
        return <p className="text-sm text-amber-400">{task.reason}</p>;
    }
    if (task.phase !== WorkerTaskPhase.Done) {
        return <PanelSkeleton />;
    }
    const { projection, stakeComparison } = task.result;
    const timingKind = nextPayoutTimingOf(projection).kind;
    return (
        <div className="flex flex-col gap-3">
            <div>
                <div className="text-xs text-muted-foreground">
                    Expected days to the next payout
                    {timingKind === NextPayoutTimingKind.InDays
                        ? ` ${NEXT_PAYOUT_AMONG_PAYING_TEXT}`
                        : ''}
                </div>
                <div className="tabular-nums">
                    {nextPayoutDaysText(projection)}
                </div>
                <div className="text-xs text-muted-foreground">
                    {nextPayoutEvidenceText(projection)}
                </div>
            </div>
            {timingKind === NextPayoutTimingKind.AlreadyEligible ? null : (
                <div>
                    <div className="text-xs text-muted-foreground">
                        P(account lost before the next payout)
                    </div>
                    <div className="tabular-nums">
                        {projection.accountLostBeforeFirstPayoutProbability ===
                        null
                            ? 'not applicable'
                            : formatPercent(
                                  projection.accountLostBeforeFirstPayoutProbability,
                              )}
                        {projection.accountLostBeforeFirstPayoutStandardError ===
                        null
                            ? ''
                            : ` (±${formatPercent(projection.accountLostBeforeFirstPayoutStandardError)})`}
                    </div>
                </div>
            )}
            {stakeComparison === null ? null : (
                <PayoutStakeComparisonSummary
                    stakeComparison={stakeComparison}
                />
            )}
        </div>
    );
}

function PayoutPlannerOutlookSection({
    outlookTask,
    result,
}: {
    outlookTask: WorkerTaskState<never, PayoutOutlookResult>;
    result: PayoutReadinessResult;
}) {
    if (result.kind === PayoutPlannerResultKind.Implausible) {
        return (
            <p className="text-sm text-muted-foreground">
                Fix the snapshot above to see the path to payout.
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-3 text-sm">
            <ul className="flex flex-col gap-1">
                {result.path.map((step) => (
                    <li
                        className={
                            step.satisfied
                                ? 'text-muted-foreground'
                                : 'text-foreground'
                        }
                        key={step.gate}
                    >
                        {payoutPathStepText(step)}
                    </li>
                ))}
            </ul>
            <PayoutPlannerOutlookOffThread task={outlookTask} />
        </div>
    );
}

function PayoutPlannerReadinessSummary({
    isPeakAssumed: isPeakAssumedForState,
    result,
}: {
    isPeakAssumed: boolean;
    result: PayoutReadinessResult;
}) {
    switch (result.kind) {
        case PayoutPlannerResultKind.Blocked: {
            return (
                <div className="flex flex-col gap-2 text-sm">
                    <p className="text-foreground">
                        {payoutBlockReasonText(result.readiness.reason)}
                    </p>
                    <p className="text-muted-foreground">{result.waitText}</p>
                    {result.firmMinimumNotice !== null && (
                        <p className="text-amber-400">
                            {payoutFirmMinimumMessage(result.firmMinimumNotice)}
                        </p>
                    )}
                    {result.simStayCeiling !== null && (
                        <p className="text-xs text-muted-foreground">
                            {simStayCeilingText(result.simStayCeiling)}
                        </p>
                    )}
                </div>
            );
        }
        case PayoutPlannerResultKind.Implausible: {
            return (
                <div className="flex flex-col gap-2">
                    {result.issues.map((issue) => (
                        <p className="text-sm text-amber-400" key={issue.field}>
                            {issue.message}
                        </p>
                    ))}
                </div>
            );
        }
        case PayoutPlannerResultKind.Ready: {
            const requested = formatGateCurrency(
                result.readiness.requestedAmount,
            );
            const cushion = result.retainedCushion;
            return (
                <div className="flex flex-col gap-3 text-sm">
                    <div>
                        <div className="text-xs text-muted-foreground">
                            Payout request
                        </div>
                        <div className="text-2xl font-semibold text-white tabular-nums">
                            {requested}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground">
                            Net after the payout split on {requested}
                        </div>
                        <div className="text-lg font-medium text-white tabular-nums">
                            {formatGateCurrency(result.netAfterSplit)}
                        </div>
                    </div>
                    <div className="flex flex-col gap-1">
                        <p className="text-muted-foreground">
                            Minimum cushion kept:{' '}
                            {formatGateCurrency(cushion.amount)} (
                            {RETAINED_CUSHION_BASIS_TEXT[cushion.basis]})
                        </p>
                        {cushion.amount <
                            HARD_RULE_2_MIN_RETAINED_CUSHION_DOLLARS && (
                            <p className="text-amber-400">
                                This is below the{' '}
                                {formatGateCurrency(
                                    HARD_RULE_2_MIN_RETAINED_CUSHION_DOLLARS,
                                )}{' '}
                                Hard Rule 2 minimum: your rulebook waives it.
                            </p>
                        )}
                        {isPeakAssumedForState && (
                            <p className="text-amber-400">
                                {PEAK_ASSUMED_VIEW.text}
                            </p>
                        )}
                    </div>
                    {result.firmMinimumNotice !== null && (
                        <p className="text-amber-400">
                            {payoutFirmMinimumMessage(result.firmMinimumNotice)}
                        </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                        Maximum withdrawable above the cushion:{' '}
                        {formatGateCurrency(result.ruleCappedWithdrawable)} (a
                        ceiling, not a recommendation: draining it is the
                        mid-size danger zone).
                    </p>
                    {result.simStayCeiling !== null && (
                        <p className="text-xs text-muted-foreground">
                            {simStayCeilingText(result.simStayCeiling)}
                        </p>
                    )}
                </div>
            );
        }
    }
}

function PayoutStakeComparisonSummary({
    stakeComparison,
}: {
    stakeComparison: PayoutStakeComparisonOutcome;
}) {
    if (isNotModeled(stakeComparison)) {
        return (
            <p className="border-t border-border pt-3 text-sm text-muted-foreground">
                {NOT_MODELED_TEXT[stakeComparison.reason]}
            </p>
        );
    }
    const requestNow = stakeComparison.requestNow.creditInclusive;
    const continueNow = stakeComparison.continueNow.creditInclusive;
    const gapStandardError = conservativeGapStandardError(
        requestNow.standardError,
        continueNow.standardError,
    );
    return (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
            <div className="text-xs text-muted-foreground">
                Request now vs continue trading (credit-inclusive)
            </div>
            <div className="text-sm">
                Requested now:{' '}
                {formatGateCurrency(stakeComparison.requestedAmount)} (you
                receive {formatGateCurrency(stakeComparison.traderReceivesNow)}{' '}
                after the split)
            </div>
            <div className="flex justify-between gap-4 tabular-nums">
                <span>
                    Request now: {formatGateCurrency(requestNow.value)}
                    {standardErrorText(requestNow.standardError)}
                </span>
                <span>
                    Continue: {formatGateCurrency(continueNow.value)}
                    {standardErrorText(continueNow.standardError)}
                </span>
            </div>
            <div className="text-sm tabular-nums">
                Difference (request now minus continue):{' '}
                {formatGateCurrency(requestNow.value - continueNow.value)}
                {standardErrorText(gapStandardError)},{' '}
                {
                    NOISE_VERDICT_TEXT[
                        noiseVerdict(requestNow, continueNow, {
                            sharedSeed: false,
                        })
                    ]
                }
            </div>
        </div>
    );
}

function PayoutSweepOutcome({
    documentedRequestDollars,
    enteredRequest,
    plan,
    task,
}: {
    documentedRequestDollars: number;
    enteredRequest: number;
    plan: Plan;
    task: WorkerTaskState<never, PayoutSweepResult>;
}) {
    if (task.phase === WorkerTaskPhase.Failed) {
        return <p className="text-sm text-amber-400">{task.reason}</p>;
    }
    if (task.phase !== WorkerTaskPhase.Done) {
        return <PanelSkeleton />;
    }
    const { result } = task;
    if (result.kind === PayoutSizeSweepResultKind.NoOptimum) {
        return <p className="text-sm text-amber-400">{result.issue}</p>;
    }
    const { optimum } = result;
    const documentedSize = effectivePayoutRequest(
        plan,
        documentedRequestDollars,
    );
    return (
        <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
                Engine optimum, not advice: ranked on credit-inclusive expected
                monthly net (the horizon credit is one bounded end-of-horizon
                payout, T32); the credit-free realized monthly net is shown
                alongside.
            </p>
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                        <th className="py-1 pr-4">Request size</th>
                        <th className="py-1 pr-4">Credit-inclusive net/mo</th>
                        <th className="py-1 pr-4">Credit-free net/mo</th>
                        <th className="py-1">Bust probability</th>
                    </tr>
                </thead>
                <tbody>
                    {optimum.rows.map((row) => (
                        <tr
                            className={
                                row.requestSize === documentedSize
                                    ? 'font-semibold text-white'
                                    : 'text-muted-foreground'
                            }
                            key={row.requestSize}
                        >
                            <td className="py-1 pr-4 tabular-nums">
                                {formatGateCurrency(row.requestSize)}
                                {sweepRowTags(row, optimum, documentedSize).map(
                                    (tag) => (
                                        <span
                                            className="ml-2 text-xs font-normal text-amber-400"
                                            key={tag}
                                        >
                                            {tag}
                                        </span>
                                    ),
                                )}
                                {row.firmMinimumAboveRequest === null ? null : (
                                    <div className="text-xs font-normal">
                                        firm minimum{' '}
                                        {formatGateCurrency(
                                            row.firmMinimumAboveRequest.minimum,
                                        )}{' '}
                                        is above the{' '}
                                        {formatGateCurrency(
                                            row.firmMinimumAboveRequest
                                                .requested,
                                        )}{' '}
                                        size
                                    </div>
                                )}
                                {row.requestedSizes.length > 1 ? (
                                    <div className="text-xs font-normal">
                                        covers{' '}
                                        {row.requestedSizes
                                            .map((size) =>
                                                formatGateCurrency(size),
                                            )
                                            .join(', ')}
                                    </div>
                                ) : null}
                            </td>
                            <td className="py-1 pr-4 tabular-nums">
                                {formatGateCurrency(creditInclusiveOf(row))}
                            </td>
                            <td className="py-1 pr-4 tabular-nums">
                                {formatGateCurrency(creditFreeOf(row))}
                            </td>
                            <td className="py-1 tabular-nums">
                                {formatPercent(row.out.fundedBustProbability)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {sweepOptimumNotes(optimum, documentedSize).map((note) => (
                    <li key={note}>{note}</li>
                ))}
            </ul>
            {enteredRequest === documentedRequestDollars ||
            optimum.personalOverride === null ? null : (
                <PersonalPayoutOverrideNote
                    enteredRequest={enteredRequest}
                    override={optimum.personalOverride}
                />
            )}
        </div>
    );
}

function PayoutSweepTable({
    documentedRequestDollars,
    enteredRequest,
    plan,
    task,
}: {
    documentedRequestDollars: number;
    enteredRequest: number;
    plan: Plan;
    task: WorkerTaskState<never, PayoutSweepResult>;
}) {
    return (
        <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
                Simulated from a fresh account at your rulebook strategy; it
                does not use the balance, peak or payouts taken entered above.
            </p>
            <PayoutSweepOutcome
                documentedRequestDollars={documentedRequestDollars}
                enteredRequest={enteredRequest}
                plan={plan}
                task={task}
            />
        </div>
    );
}

function PersonalPayoutOverrideNote({
    enteredRequest,
    override,
}: {
    enteredRequest: number;
    override: NonNullable<PayoutSizeSweepOptimum['personalOverride']>;
}) {
    const { firmMinimumAboveRequest } = override.row;
    return (
        <div className="flex flex-col gap-1 border-t border-border pt-2 text-xs">
            <p className="text-muted-foreground">
                Your entered size: {formatGateCurrency(enteredRequest)}
                {override.row.requestSize === enteredRequest
                    ? ''
                    : ` (effective ${formatGateCurrency(override.row.requestSize)})`}
            </p>
            {firmMinimumAboveRequest === null ? null : (
                <p className="text-amber-400">
                    firm minimum{' '}
                    {formatGateCurrency(firmMinimumAboveRequest.minimum)} is
                    above your{' '}
                    {formatGateCurrency(firmMinimumAboveRequest.requested)}{' '}
                    entry
                </p>
            )}
            {override.warning === null ? null : (
                <p className="text-amber-400">
                    Outside the safe band:{' '}
                    {formatPercent(override.warning.overrideBustProbability)}{' '}
                    bust probability vs{' '}
                    {formatPercent(override.warning.optimumBustProbability)} at
                    the optimum size (
                    {formatGateCurrency(override.warning.overrideMonthlyNet)} vs{' '}
                    {formatGateCurrency(override.warning.optimumMonthlyNet)}{' '}
                    monthly net).
                </p>
            )}
        </div>
    );
}

function policyFor(plan: Plan, rulebook: RulebookParameters): PayoutPolicy {
    const { assumptions, policy } = buildEnginePolicy({
        fundedHorizonDays: DEFAULT_FUNDED_HORIZON_DAYS,
        plan,
        rulebook,
    });
    return {
        assumptions,
        spec: {
            enginePolicy: policy,
            rulebook,
            run: {
                maxEvalDays: DEFAULT_MAX_EVAL_DAYS,
                seed: SWEEP_SEED,
                trials: SWEEP_TRIALS,
            },
        },
    };
}

function rulebookStateOf({
    hasSession,
    isQueryFailed,
    isSessionFailed,
    isSessionPending,
    rulebook,
}: {
    hasSession: boolean;
    isQueryFailed: boolean;
    isSessionFailed: boolean;
    isSessionPending: boolean;
    rulebook: RulebookParameters | undefined;
}): RulebookState {
    if (!hasSession) {
        if (isSessionPending) return { status: RulebookStatus.Loading };
        return isSessionFailed
            ? { status: RulebookStatus.Failed }
            : { rulebook: DEFAULT_RULEBOOK, status: RulebookStatus.Ready };
    }
    if (rulebook !== undefined) {
        return { rulebook, status: RulebookStatus.Ready };
    }
    return {
        status: isQueryFailed ? RulebookStatus.Failed : RulebookStatus.Loading,
    };
}

function RulebookStatusNotice({
    status,
}: {
    status: RulebookStatus.Failed | RulebookStatus.Loading;
}) {
    return (
        <p
            className={
                status === RulebookStatus.Failed
                    ? 'text-sm text-amber-400'
                    : 'text-sm text-muted-foreground'
            }
        >
            {RULEBOOK_NOTICE_TEXT[status]}
        </p>
    );
}

function standardErrorText(standardError: null | number): string {
    return standardError === null
        ? ''
        : ` (±${formatGateCurrency(standardError)})`;
}

function sweepOptimumNotes(
    optimum: PayoutSizeSweepOptimum,
    documentedSize: number,
): string[] {
    const { winner } = optimum;
    const documented = optimum.rows.find(
        (row) => row.requestSize === documentedSize,
    );
    if (documented === undefined) {
        return [
            `The documented request size of ${formatGateCurrency(documentedSize)} is not on the sweep grid.`,
        ];
    }
    if (winner.requestSize === documented.requestSize) {
        return [
            'The engine optimum is the documented request size.',
            ...midSizeNotes(documented, winner),
        ];
    }
    const notes = [
        `Engine optimum: ${formatGateCurrency(winner.requestSize)} at ${formatGateCurrency(creditInclusiveOf(winner))} a month and ${formatPercent(winner.out.fundedBustProbability)} bust probability, against ${formatGateCurrency(documented.requestSize)} at ${formatGateCurrency(creditInclusiveOf(documented))} a month and ${formatPercent(documented.out.fundedBustProbability)} bust probability at the documented size.`,
    ];
    if (optimum.creditSensitive) {
        notes.push(
            'The credit-free ranking prefers a different size, so this optimum depends on the end-of-horizon credit.',
        );
    }
    if (
        winner.out.fundedBustProbability > documented.out.fundedBustProbability
    ) {
        notes.push(
            'The engine optimum has a higher bust probability than the documented rule: a higher monthly mean is not a recommendation.',
        );
    }
    return [...notes, ...midSizeNotes(documented, winner)];
}

function sweepRequestFor(
    plan: Plan,
    requestSize: PayoutPlannerUrlState['requestSize'],
    spec: DocumentedPolicySpec,
): PayoutSweepRequest {
    return {
        firmId: plan.id.firm,
        personalOverrideRequest: requestSize,
        planSerial: serializePlanId(plan.id),
        spec,
    };
}

function sweepRowTags(
    row: PayoutSizeSweepRow,
    optimum: PayoutSizeSweepOptimum,
    documentedSize: number,
): string[] {
    return [
        ...(row.requestSize === documentedSize ? ['Documented rule'] : []),
        ...(row.requestSize === optimum.winner.requestSize
            ? ['Engine optimum']
            : []),
    ];
}
