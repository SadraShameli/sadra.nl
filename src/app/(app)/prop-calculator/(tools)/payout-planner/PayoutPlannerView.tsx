'use client';

import { CircleAlert, CircleCheck } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { type ReactNode, useMemo, useState } from 'react';

import { DEFAULT_FUNDED_HORIZON_DAYS } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { ComputationId } from '~/app/(app)/prop-calculator/_components/ComputationId';
import FirmPlanPicker from '~/app/(app)/prop-calculator/_components/FirmPlanPicker';
import {
    PanelSkeleton,
    PanelSkeletonSize,
} from '~/app/(app)/prop-calculator/_components/PanelSkeleton';
import {
    payoutBlockReasonText,
    payoutFirmMinimumMessage,
    payoutPathStepText,
    type PayoutPlannerAccountInput,
    type PayoutPlannerBlockedResult,
    type PayoutPlannerReadyResult,
    PayoutPlannerResultKind,
    planPayoutReadiness,
    simStayCeilingText,
} from '~/app/(app)/prop-calculator/_components/payoutPlanner/payoutPlannerModel';
import {
    decodePayoutPlannerUrlState,
    encodePayoutPlannerUrlState,
    hasPayoutPlannerUrlRequest,
    parsePayoutPlannerBalance,
    parsePayoutPlannerCount,
    parsePayoutPlannerDate,
    parsePayoutPlannerOptionalDollars,
    payoutPlannerRulebookRequest,
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
    ToolRulebookStatus,
    useToolRulebook,
} from '~/app/(app)/prop-calculator/_components/useToolRulebook';
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
import { payoutStakeViewOf } from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceValueModel';
import { type AssumptionView } from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceViewModel';
import { AssumptionsList } from '~/app/(app)/prop-calculator/accounts/_components/advice/AssumptionsList';
import { InfoNote } from '~/components/InfoNote';
import { InputsBesideResults } from '~/components/InputsBesideResults';
import { LabelWithInfo } from '~/components/LabelWithInfo';
import { PanelSubheading } from '~/components/PanelSubheading';
import { StatStrip } from '~/components/StatStrip';
import { StatusRow, StatusTone } from '~/components/StatusRow';
import { ToolPanel } from '~/components/ToolPanel';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { DataTable, type DataTableColumn } from '~/components/ui/data-table';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import InfoPopover from '~/components/ui/info-popover';
import { Input } from '~/components/ui/input';
import { IsoDatePicker } from '~/components/ui/iso-date-picker';
import { formatPercent, formatWholeOrCentsCurrency } from '~/lib/format';
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
    type DocumentedPolicySpec,
    HARD_RULE_2_MIN_RETAINED_CUSHION_DOLLARS,
    MIN_RETAINED_CUSHION_TEXT,
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
    personalPayoutOverrideWarningText,
    RETAINED_CUSHION_BASIS_TEXT,
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
import { cn } from '~/lib/utilities';

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
enum SweepColumn {
    BustProbability = 'bust-probability',
    CreditFree = 'credit-free',
    CreditInclusive = 'credit-inclusive',
    RequestSize = 'request-size',
    SentLive = 'sent-live',
}

const SENT_LIVE_COLUMN: DataTableColumn<PayoutSizeSweepRow> = {
    cell: ({ row: { original: row } }) => (
        <span className="tabular-nums">
            {formatPercent(row.out.liveTransferProbability)}
        </span>
    ),
    header: 'Sent live',
    id: SweepColumn.SentLive,
};

const SWEEP_TABLE_CAPTION =
    'Payout-size sweep: simulated request sizes with their monthly net and bust probability';
const SWEEP_HAZARD_RANKING_TEXT =
    "The engine optimum row is chosen at this hazard: a smaller request size means more paid payouts and so more transfer chances. The share of runs sent live above is the engine optimum row's.";
const SWEEP_TRIGGER_RANKING_TEXT =
    "The engine optimum row is chosen with this trigger in force: the request size changes how fast payouts add up to the cumulative amount, so each size sends a different share of runs live. The sent-live column shows each size's share.";
const SWEEP_BASIS_TEXT =
    'Simulated from a fresh account at your rulebook strategy; it does not use the balance, peak or payouts taken entered above.';
const SWEEP_RANKING_TEXT =
    'Engine optimum, not advice: ranked on credit-inclusive expected monthly net (the horizon credit is one bounded end-of-horizon payout, T32); the credit-free realized monthly net is shown alongside.';
const SWEEP_WITHIN_NOISE_TEXT =
    'The engine optimum is within simulation noise of the documented size: treat the two as the same size.';
const PEAK_ASSUMED_VIEW: AssumptionView = {
    bias: AssumptionBias.Optimistic,
    text: 'No peak balance was entered, so the current balance is assumed to be the peak, the most generous trailing-drawdown state.',
};

const RULEBOOK_FAILED_TEXT =
    'Your rulebook could not be loaded, so no payout figures are shown.';

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

export function PayoutPlannerView() {
    const searchParameters = useSearchParams();
    const [initialParameters] = useState(
        () => new URLSearchParams(searchParameters.toString()),
    );
    const [typedState, setTypedState] = useState(() =>
        decodePayoutPlannerUrlState(initialParameters),
    );
    const [isRequestTyped, setIsRequestTyped] = useState(() =>
        hasPayoutPlannerUrlRequest(initialParameters),
    );
    const [invalidFields, setInvalidFields] = useState<
        ReadonlySet<PayoutPlannerUrlParameter>
    >(() => new Set());
    const isInputValid = invalidFields.size === 0;
    const isRequestSizeValid = !invalidFields.has(
        PayoutPlannerUrlParameter.RequestSize,
    );
    const { rulebook: toolRulebook, status: rulebookStatus } =
        useToolRulebook();
    const rulebook =
        rulebookStatus === ToolRulebookStatus.Ready ? toolRulebook : null;
    const isRulebookFailed = rulebookStatus === ToolRulebookStatus.Failed;
    const isRulebookLoading = rulebook === null && !isRulebookFailed;
    const rulebookRequest =
        rulebook === null ? null : payoutPlannerRulebookRequest(rulebook);
    const state = useMemo(
        (): PayoutPlannerUrlState =>
            isRequestTyped || rulebookRequest === null
                ? typedState
                : { ...typedState, requestSize: rulebookRequest },
        [typedState, isRequestTyped, rulebookRequest],
    );
    const rulebookRequestKey = String(rulebookRequest);
    const [requestFieldKey, setRequestFieldKey] = useState(rulebookRequestKey);
    if (!isRequestTyped && requestFieldKey !== rulebookRequestKey) {
        setRequestFieldKey(rulebookRequestKey);
        setInvalidFields((current) =>
            invalidFieldsWith(
                current,
                PayoutPlannerUrlParameter.RequestSize,
                true,
            ),
        );
    }
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
                !isPlanned(result)
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
        setInvalidFields((current) =>
            invalidFieldsWith(current, field, isValid),
        );
    };

    const change = (patch: Partial<PayoutPlannerUrlState>) => {
        if (patch.requestSize !== undefined) setIsRequestTyped(true);
        setTypedState((current) => ({ ...current, ...patch }));
    };

    return (
        <>
            <ToolPageHeading
                ownQuery={encodePayoutPlannerUrlState(state, [
                    ...invalidFields,
                ])}
                toolId={ToolId.PayoutPlanner}
            />
            <InputsBesideResults
                className="app-prop-calculator__payout-planner mb-10"
                inputs={
                    <section aria-labelledby={INPUTS_HEADING_ID}>
                        <ToolPanel title="Account" titleId={INPUTS_HEADING_ID}>
                            <PayoutPlannerInputs
                                onChange={change}
                                onValidityChange={changeValidity}
                                requestFieldKey={requestFieldKey}
                                state={state}
                            />
                        </ToolPanel>
                    </section>
                }
                results={
                    <>
                        <section aria-labelledby={READINESS_HEADING_ID}>
                            <ToolPanel
                                info={
                                    result === null || !isInputValid
                                        ? undefined
                                        : payoutReadinessNotes(result)
                                }
                                isComputing={isRulebookLoading}
                                title="Readiness"
                                titleId={READINESS_HEADING_ID}
                            >
                                {rulebook === null || result === null ? (
                                    <RulebookStatusNotice
                                        isFailed={isRulebookFailed}
                                    />
                                ) : isInputValid ? (
                                    <PayoutPlannerReadinessSummary
                                        isPeakAssumed={isPeakAssumed(state)}
                                        result={result}
                                    />
                                ) : (
                                    <StatusRow
                                        title={FIX_FIELD_TEXT}
                                        tone={StatusTone.Warn}
                                    />
                                )}
                            </ToolPanel>
                        </section>
                        <section aria-labelledby={OUTLOOK_HEADING_ID}>
                            <ToolPanel
                                info={
                                    result === null || !isInputValid
                                        ? undefined
                                        : payoutOutlookNotes(outlookTask)
                                }
                                isComputing={
                                    isRulebookLoading ||
                                    (isInputValid &&
                                        result !== null &&
                                        isPlanned(result) &&
                                        isTaskRunning(outlookTask))
                                }
                                title="Path to payout"
                                titleId={OUTLOOK_HEADING_ID}
                            >
                                {result === null ? (
                                    <RulebookStatusNotice
                                        isFailed={isRulebookFailed}
                                    />
                                ) : isInputValid ? (
                                    <PayoutPlannerOutlookSection
                                        outlookTask={outlookTask}
                                        result={result}
                                    />
                                ) : (
                                    <StatusRow
                                        title={FIX_FIELD_TEXT}
                                        tone={StatusTone.Warn}
                                    />
                                )}
                            </ToolPanel>
                        </section>
                        <section aria-labelledby={SWEEP_HEADING_ID}>
                            <ToolPanel
                                description={SWEEP_BASIS_TEXT}
                                info={
                                    rulebook === null ||
                                    !isRequestSizeValid ? undefined : (
                                        <PayoutSweepNotes task={sweepTask} />
                                    )
                                }
                                isComputing={
                                    isRulebookLoading ||
                                    (rulebook !== null &&
                                        isRequestSizeValid &&
                                        isTaskRunning(sweepTask))
                                }
                                title="Payout-size sweep"
                                titleId={SWEEP_HEADING_ID}
                            >
                                {rulebook === null ? (
                                    <RulebookStatusNotice
                                        isFailed={isRulebookFailed}
                                    />
                                ) : isRequestSizeValid ? (
                                    <PayoutSweepOutcome
                                        documentedRequestDollars={
                                            rulebook.payout.requestCents /
                                            CENTS_PER_DOLLAR
                                        }
                                        enteredRequest={state.requestSize}
                                        plan={state.plan}
                                        task={sweepTask}
                                    />
                                ) : (
                                    <StatusRow
                                        title={FIX_FIELD_TEXT}
                                        tone={StatusTone.Warn}
                                    />
                                )}
                            </ToolPanel>
                        </section>
                        {policy === null ? null : (
                            <section aria-labelledby={ASSUMPTIONS_HEADING_ID}>
                                <PayoutPlannerAssumptions
                                    headingId={ASSUMPTIONS_HEADING_ID}
                                    isPeakAssumed={isPeakAssumed(state)}
                                    policy={policy}
                                />
                            </section>
                        )}
                    </>
                }
            />
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

function creditFreeStandardErrorOf(row: PayoutSizeSweepRow): null | number {
    return row.kind === StartBasis.Fresh
        ? row.out.estimates.expectedMonthlyRealizedNet.standardError
        : row.out.estimates.fromStateExpectedRealizedCash.standardError;
}

function creditInclusiveFigureText(row: PayoutSizeSweepRow): string {
    return `${formatWholeOrCentsCurrency(creditInclusiveOf(row))}${standardErrorText(
        creditInclusiveStandardErrorOf(row),
    )}`;
}

function creditInclusiveOf(row: PayoutSizeSweepRow): number {
    return row.kind === StartBasis.Fresh
        ? row.out.expectedMonthlyNet
        : row.out.fromStateExpectedCash;
}

function creditInclusiveStandardErrorOf(
    row: PayoutSizeSweepRow,
): null | number {
    return row.kind === StartBasis.Fresh
        ? row.out.estimates.expectedMonthlyNet.standardError
        : row.out.estimates.fromStateExpectedCash.standardError;
}

function FirmMinimumNotice({
    notice,
}: {
    notice: Parameters<typeof payoutFirmMinimumMessage>[0];
}) {
    return (
        <StatusRow
            title={
                <span className="block first-letter:uppercase">
                    {payoutFirmMinimumMessage(notice)}
                </span>
            }
            tone={StatusTone.Warn}
        />
    );
}

function invalidFieldsWith(
    current: ReadonlySet<PayoutPlannerUrlParameter>,
    field: PayoutPlannerUrlParameter,
    isValid: boolean,
): ReadonlySet<PayoutPlannerUrlParameter> {
    if (current.has(field) !== isValid) return current;
    const next = new Set(current);
    if (isValid) next.delete(field);
    else next.add(field);
    return next;
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

function isPlanned(
    result: PayoutReadinessResult,
): result is PayoutPlannerBlockedResult | PayoutPlannerReadyResult {
    return (
        result.kind === PayoutPlannerResultKind.Blocked ||
        result.kind === PayoutPlannerResultKind.Ready
    );
}

function isTaskRunning<TResult>(
    task: WorkerTaskState<never, TResult>,
): boolean {
    return (
        task.phase === WorkerTaskPhase.Idle ||
        task.phase === WorkerTaskPhase.Running
    );
}

function isWithinSimulationNoise(
    a: PayoutSizeSweepRow,
    b: PayoutSizeSweepRow,
): boolean {
    const seA = creditInclusiveStandardErrorOf(a);
    const seB = creditInclusiveStandardErrorOf(b);
    return (
        noiseVerdict(
            { standardError: seA, value: creditInclusiveOf(a) },
            { standardError: seB, value: creditInclusiveOf(b) },
            {
                differenceStandardError:
                    seA === null || seB === null ? null : Math.max(seA, seB),
                sharedSeed: true,
            },
        ) === NoiseVerdict.WithinNoise
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
              `Mid-size requests (${formatWholeOrCentsCurrency(MID_SIZE_BAND_MIN)} to ${formatWholeOrCentsCurrency(MID_SIZE_BAND_MAX)}) keep the balance pinned near the retained cushion and carried very high bust rates in the historical sweep.`,
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

function payoutOutlookNotes(
    task: WorkerTaskState<never, PayoutOutlookResult>,
): ReactNode {
    if (task.phase !== WorkerTaskPhase.Done) return undefined;
    const { cumulativePayoutTrigger, pastPayoutsNote, stakeComparison } =
        task.result;
    const isTriggerInStake =
        stakeComparison !== null && !isNotModeled(stakeComparison);
    if (
        pastPayoutsNote === undefined &&
        (cumulativePayoutTrigger === undefined || isTriggerInStake)
    ) {
        return undefined;
    }
    return (
        <>
            {cumulativePayoutTrigger === undefined ||
            isTriggerInStake ? null : (
                <p>{assumptionText(cumulativePayoutTrigger)}</p>
            )}
            {pastPayoutsNote === undefined ? null : <p>{pastPayoutsNote}</p>}
        </>
    );
}

function PayoutPlannerAssumptions({
    headingId,
    isPeakAssumed: isPeakAssumedForState,
    policy,
}: {
    headingId: string;
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
        <ToolPanel
            description={
                <>
                    Behind the readiness, the path and the sweep: funded risk{' '}
                    {formatWholeOrCentsCurrency(
                        funded.riskCents / CENTS_PER_DOLLAR,
                    )}{' '}
                    and take profit{' '}
                    {formatWholeOrCentsCurrency(
                        funded.takeProfitCents / CENTS_PER_DOLLAR,
                    )}{' '}
                    per trade, win rate {formatPercent(strategy.winrate)},
                    reward-to-risk {strategy.rr}, up to {funded.tradesPerDayMax}{' '}
                    trades a day, retained cushion{' '}
                    {formatWholeOrCentsCurrency(
                        payout.retainedCushionCents / CENTS_PER_DOLLAR,
                    )}
                    , {trials} trials, seed {seed}, {fundedHorizonDays}-day
                    funded horizon.
                </>
            }
            title="Assumptions"
            titleId={headingId}
        >
            <AssumptionsList assumptions={views} />
        </ToolPanel>
    );
}

function PayoutPlannerCountField({
    field,
    id,
    info,
    invalidText,
    label,
    onValid,
    onValidityChange,
    value,
}: {
    field: PayoutPlannerUrlParameter;
    id: string;
    info?: string;
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
        <Field data-invalid={isInvalid}>
            <LabelWithInfo htmlFor={id} info={info} label={label} />
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
                <FieldError id={hintId}>{invalidText}</FieldError>
            ) : null}
        </Field>
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
        <Field data-invalid={isInvalid}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
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
                <FieldError id={hintId}>{invalidText}</FieldError>
            ) : null}
        </Field>
    );
}

function PayoutPlannerInputs({
    onChange,
    onValidityChange,
    requestFieldKey,
    state,
}: {
    onChange: (patch: Partial<PayoutPlannerUrlState>) => void;
    onValidityChange: FieldValidityChange;
    requestFieldKey: string;
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
                key={requestFieldKey}
                label="Requested payout size ($)"
                onValid={(requestSize) => {
                    if (requestSize !== null) onChange({ requestSize });
                }}
                onValidityChange={onValidityChange}
                parse={parsePayoutPlannerBalance}
                value={state.requestSize}
            />
            <div className="grid gap-4 md:grid-cols-2">
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
                    info="Qualifying days since your last payout, counted toward the plan's payout day gate."
                    invalidText="Enter a whole number of qualifying days."
                    label="Qualifying days"
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
            <Field>
                <FieldLabel htmlFor="payout-planner-last-payout-on">
                    Last payout date (optional)
                </FieldLabel>
                <IsoDatePicker
                    id="payout-planner-last-payout-on"
                    onChange={(isoDate) => {
                        onChange({
                            lastPayoutOn: parsePayoutPlannerDate(isoDate),
                        });
                    }}
                    value={state.lastPayoutOn}
                />
            </Field>
        </div>
    );
}

function PayoutPlannerOutlookOffThread({
    task,
}: {
    task: WorkerTaskState<never, PayoutOutlookResult>;
}) {
    if (task.phase === WorkerTaskPhase.Failed) {
        return (
            <Alert variant="destructive">
                <AlertDescription>{task.reason}</AlertDescription>
            </Alert>
        );
    }
    if (task.phase !== WorkerTaskPhase.Done) {
        return <PanelSkeleton />;
    }
    const { projection, stakeComparison } = task.result;
    const timingKind = nextPayoutTimingOf(projection).kind;
    const lostProbabilityText =
        projection.accountLostBeforeFirstPayoutProbability === null
            ? 'not applicable'
            : formatPercent(projection.accountLostBeforeFirstPayoutProbability);
    const lostStandardErrorText =
        projection.accountLostBeforeFirstPayoutStandardError === null
            ? ''
            : ` (±${formatPercent(projection.accountLostBeforeFirstPayoutStandardError)})`;
    return (
        <div className="flex flex-col gap-3">
            <StatStrip
                items={[
                    {
                        caption: nextPayoutEvidenceText(projection),
                        id: 'days-to-next-payout',
                        label:
                            timingKind === NextPayoutTimingKind.InDays
                                ? `Expected days to the next payout ${NEXT_PAYOUT_AMONG_PAYING_TEXT}`
                                : 'Expected days to the next payout',
                        value: nextPayoutDaysText(projection),
                    },
                    ...(timingKind === NextPayoutTimingKind.AlreadyEligible
                        ? []
                        : [
                              {
                                  id: 'lost-before-next-payout',
                                  label: 'P(account lost before the next payout)',
                                  value: `${lostProbabilityText}${lostStandardErrorText}`,
                              },
                          ]),
                ]}
            />
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
    if (!isPlanned(result)) {
        return (
            <InfoNote>
                Fix the snapshot above to see the path to payout.
            </InfoNote>
        );
    }
    return (
        <div className="flex flex-col gap-3 text-sm">
            <ul className="flex flex-col gap-1.5">
                {result.path.map((step) => (
                    <li
                        className={cn(
                            'flex items-start gap-2',
                            step.satisfied
                                ? 'text-muted-foreground'
                                : 'text-foreground',
                        )}
                        key={step.gate}
                    >
                        {step.satisfied ? (
                            <CircleCheck
                                aria-hidden="true"
                                className="mt-0.5 size-4 shrink-0 text-success"
                            />
                        ) : (
                            <CircleAlert
                                aria-hidden="true"
                                className="mt-0.5 size-4 shrink-0 text-warning"
                            />
                        )}
                        <span className="first-letter:uppercase">
                            {payoutPathStepText(step)}
                        </span>
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
                    <StatusRow
                        detail={
                            <span className="block first-letter:uppercase">
                                {result.waitText}
                            </span>
                        }
                        title={
                            <span className="block first-letter:uppercase">
                                {payoutBlockReasonText(result.readiness.reason)}
                            </span>
                        }
                        tone={StatusTone.Warn}
                    />
                    {result.firmMinimumNotice !== null && (
                        <FirmMinimumNotice notice={result.firmMinimumNotice} />
                    )}
                </div>
            );
        }
        case PayoutPlannerResultKind.Implausible: {
            return (
                <div className="flex flex-col gap-2">
                    {result.issues.map((issue) => (
                        <StatusRow
                            key={issue.field}
                            title={issue.message}
                            tone={StatusTone.Warn}
                        />
                    ))}
                </div>
            );
        }
        case PayoutPlannerResultKind.Ready: {
            const requested = formatWholeOrCentsCurrency(
                result.readiness.requestedAmount,
            );
            const cushion = result.retainedCushion;
            return (
                <div className="flex flex-col gap-3 text-sm">
                    <StatStrip
                        items={[
                            {
                                id: 'payout-request',
                                label: 'Payout request',
                                value: requested,
                            },
                            {
                                id: 'net-after-split',
                                label: `Net after the payout split on ${requested}`,
                                value: formatWholeOrCentsCurrency(
                                    result.netAfterSplit,
                                ),
                            },
                        ]}
                    />
                    <p className="m-0 text-muted-foreground">
                        Minimum cushion kept:{' '}
                        {formatWholeOrCentsCurrency(cushion.amount)} (
                        {RETAINED_CUSHION_BASIS_TEXT[cushion.basis]})
                    </p>
                    {cushion.amount <
                        HARD_RULE_2_MIN_RETAINED_CUSHION_DOLLARS && (
                        <StatusRow
                            title={`This is below ${MIN_RETAINED_CUSHION_TEXT}: your rulebook waives it.`}
                            tone={StatusTone.Warn}
                        />
                    )}
                    {isPeakAssumedForState && (
                        <StatusRow
                            title={PEAK_ASSUMED_VIEW.text}
                            tone={StatusTone.Warn}
                        />
                    )}
                    {result.firmMinimumNotice !== null && (
                        <FirmMinimumNotice notice={result.firmMinimumNotice} />
                    )}
                    <InfoNote
                        info="A ceiling, not a recommendation: draining it is the mid-size danger zone."
                        infoTitle="Maximum withdrawable"
                    >
                        Maximum withdrawable above the cushion:{' '}
                        {formatWholeOrCentsCurrency(
                            result.ruleCappedWithdrawable,
                        )}
                    </InfoNote>
                </div>
            );
        }
        case PayoutPlannerResultKind.Unreadable: {
            return (
                <StatusRow
                    title={`The snapshot could not be rebuilt: ${result.reason}`}
                    tone={StatusTone.Fail}
                />
            );
        }
    }
}

function payoutReadinessNotes(result: PayoutReadinessResult): ReactNode {
    if (!isPlanned(result)) return undefined;
    if (result.simStayCeiling === null && result.liveTriggerNote === null) {
        return undefined;
    }
    return (
        <>
            {result.simStayCeiling === null ? null : (
                <p>{simStayCeilingText(result.simStayCeiling)}</p>
            )}
            {result.liveTriggerNote === null ? null : (
                <p>{result.liveTriggerNote}</p>
            )}
        </>
    );
}

function PayoutStakeComparisonSummary({
    stakeComparison,
}: {
    stakeComparison: PayoutStakeComparisonOutcome;
}) {
    if (isNotModeled(stakeComparison)) {
        return (
            <StatusRow
                title={NOT_MODELED_TEXT[stakeComparison.reason]}
                tone={StatusTone.Neutral}
            />
        );
    }
    const requestNow = stakeComparison.requestNow.creditInclusive;
    const { liveTransferNotes } = payoutStakeViewOf(stakeComparison);
    const continueNow = stakeComparison.continueNow.creditInclusive;
    const gapStandardError = conservativeGapStandardError(
        requestNow.standardError,
        continueNow.standardError,
    );
    return (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
            <div className="flex items-center gap-1.5">
                <PanelSubheading>
                    Request now vs continue trading (credit-inclusive)
                </PanelSubheading>
                {liveTransferNotes.length === 0 ? null : (
                    <InfoPopover title="Request now vs continue trading">
                        {liveTransferNotes.map((note) => (
                            <p key={note}>{note}</p>
                        ))}
                    </InfoPopover>
                )}
            </div>
            <div className="text-sm">
                Requested now:{' '}
                {formatWholeOrCentsCurrency(stakeComparison.requestedAmount)}{' '}
                (you receive{' '}
                {formatWholeOrCentsCurrency(stakeComparison.traderReceivesNow)}{' '}
                after the split)
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 tabular-nums">
                <span>
                    Request now: {formatWholeOrCentsCurrency(requestNow.value)}
                    {standardErrorText(requestNow.standardError)}
                </span>
                <span>
                    Continue: {formatWholeOrCentsCurrency(continueNow.value)}
                    {standardErrorText(continueNow.standardError)}
                </span>
            </div>
            <div className="text-sm tabular-nums">
                Difference (request now minus continue):{' '}
                {formatWholeOrCentsCurrency(
                    requestNow.value - continueNow.value,
                )}
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

function PayoutSweepNotes({
    task,
}: {
    task: WorkerTaskState<never, PayoutSweepResult>;
}) {
    const optimum =
        task.phase === WorkerTaskPhase.Done &&
        task.result.kind !== PayoutSizeSweepResultKind.NoOptimum
            ? task.result.optimum
            : null;
    return (
        <>
            <p>{SWEEP_RANKING_TEXT}</p>
            {optimum?.liveTransfer === undefined ? null : (
                <>
                    <p>{assumptionText(optimum.liveTransfer)}</p>
                    <p>{SWEEP_HAZARD_RANKING_TEXT}</p>
                </>
            )}
            {optimum?.cumulativePayoutTrigger === undefined ? null : (
                <>
                    <p>{assumptionText(optimum.cumulativePayoutTrigger)}</p>
                    <p>{SWEEP_TRIGGER_RANKING_TEXT}</p>
                </>
            )}
        </>
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
        return (
            <Alert variant="destructive">
                <AlertDescription>{task.reason}</AlertDescription>
            </Alert>
        );
    }
    if (task.phase !== WorkerTaskPhase.Done) {
        return <PanelSkeleton />;
    }
    const { result } = task;
    if (result.kind === PayoutSizeSweepResultKind.NoOptimum) {
        return <StatusRow title={result.issue} tone={StatusTone.Warn} />;
    }
    const { optimum } = result;
    const documentedSize = effectivePayoutRequest(
        plan,
        documentedRequestDollars,
    );
    const isTransferPriced =
        optimum.liveTransfer !== undefined ||
        optimum.cumulativePayoutTrigger !== undefined;
    return (
        <div className="flex flex-col gap-2">
            <DataTable
                caption={SWEEP_TABLE_CAPTION}
                columns={[
                    {
                        cell: ({ row: { original: row } }) => (
                            <>
                                <span className="flex flex-wrap items-center gap-2">
                                    {formatWholeOrCentsCurrency(
                                        row.requestSize,
                                    )}
                                    {sweepRowTags(
                                        row,
                                        optimum,
                                        documentedSize,
                                    ).map((tag) => (
                                        <Badge key={tag}>{tag}</Badge>
                                    ))}
                                </span>
                                {row.firmMinimumAboveRequest === null ? null : (
                                    <div className="text-xs font-normal">
                                        firm minimum{' '}
                                        {formatWholeOrCentsCurrency(
                                            row.firmMinimumAboveRequest.minimum,
                                        )}{' '}
                                        is above the{' '}
                                        {formatWholeOrCentsCurrency(
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
                                                formatWholeOrCentsCurrency(
                                                    size,
                                                ),
                                            )
                                            .join(', ')}
                                    </div>
                                ) : null}
                            </>
                        ),
                        header: 'Request size',
                        id: SweepColumn.RequestSize,
                        meta: { isRowHeader: true },
                    },
                    {
                        cell: ({ row: { original: row } }) => (
                            <span className="tabular-nums">
                                {formatWholeOrCentsCurrency(
                                    creditInclusiveOf(row),
                                )}
                                {standardErrorText(
                                    creditInclusiveStandardErrorOf(row),
                                )}
                            </span>
                        ),
                        header: 'Credit-inclusive net/mo (± SE)',
                        id: SweepColumn.CreditInclusive,
                    },
                    {
                        cell: ({ row: { original: row } }) => (
                            <span className="tabular-nums">
                                {formatWholeOrCentsCurrency(creditFreeOf(row))}
                                {standardErrorText(
                                    creditFreeStandardErrorOf(row),
                                )}
                            </span>
                        ),
                        header: 'Credit-free net/mo (± SE)',
                        id: SweepColumn.CreditFree,
                    },
                    {
                        cell: ({ row: { original: row } }) => (
                            <span className="tabular-nums">
                                {formatPercent(row.out.fundedBustProbability)}
                                {standardErrorText(
                                    row.out.estimates.fundedBustProbability
                                        .standardError,
                                    formatPercent,
                                )}
                            </span>
                        ),
                        header: 'Bust probability (± SE)',
                        id: SweepColumn.BustProbability,
                    },
                    ...(isTransferPriced ? [SENT_LIVE_COLUMN] : []),
                ]}
                data={[...optimum.rows]}
                isSortable={false}
                pageSize={null}
                rowClassName={(row) =>
                    row.requestSize === documentedSize
                        ? 'font-semibold text-foreground'
                        : 'text-muted-foreground'
                }
                rowId={(row) => String(row.requestSize)}
            />
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
                Your entered size: {formatWholeOrCentsCurrency(enteredRequest)}
                {override.row.requestSize === enteredRequest
                    ? ''
                    : ` (effective ${formatWholeOrCentsCurrency(override.row.requestSize)})`}
            </p>
            {firmMinimumAboveRequest === null ? null : (
                <StatusRow
                    title={
                        <span className="block first-letter:uppercase">
                            firm minimum{' '}
                            {formatWholeOrCentsCurrency(
                                firmMinimumAboveRequest.minimum,
                            )}{' '}
                            is above your{' '}
                            {formatWholeOrCentsCurrency(
                                firmMinimumAboveRequest.requested,
                            )}{' '}
                            entry
                        </span>
                    }
                    tone={StatusTone.Warn}
                />
            )}
            {override.warning === null ? null : (
                <StatusRow
                    detail={personalPayoutOverrideWarningText(override.warning)}
                    title="Outside the safe band"
                    tone={StatusTone.Warn}
                />
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

function RulebookStatusNotice({ isFailed }: { isFailed: boolean }) {
    return isFailed ? (
        <Alert variant="destructive">
            <AlertDescription>{RULEBOOK_FAILED_TEXT}</AlertDescription>
        </Alert>
    ) : (
        <PanelSkeleton size={PanelSkeletonSize.Bar} />
    );
}

function standardErrorText(
    standardError: null | number,
    format: (value: number) => string = formatWholeOrCentsCurrency,
): string {
    return standardError === null ? '' : ` (±${format(standardError)})`;
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
            `The documented request size of ${formatWholeOrCentsCurrency(documentedSize)} is not on the sweep grid.`,
        ];
    }
    if (winner.requestSize === documented.requestSize) {
        return [
            'The engine optimum is the documented request size.',
            ...midSizeNotes(documented, winner),
        ];
    }
    const notes = [
        `Engine optimum: ${formatWholeOrCentsCurrency(winner.requestSize)} at ${creditInclusiveFigureText(winner)} a month credit-inclusive and ${formatPercent(winner.out.fundedBustProbability)} bust probability, against ${formatWholeOrCentsCurrency(documented.requestSize)} at ${creditInclusiveFigureText(documented)} a month credit-inclusive and ${formatPercent(documented.out.fundedBustProbability)} bust probability at the documented size.`,
    ];
    if (isWithinSimulationNoise(winner, documented)) {
        notes.push(SWEEP_WITHIN_NOISE_TEXT);
    }
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
