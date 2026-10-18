'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useId, useRef, useState } from 'react';
import { type Control, Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { STICKY_ACTION_BAR_PROPS } from '~/app/(app)/_components/ScrollToTop';
import { DAY_STOP_KIND_LABELS } from '~/app/(app)/prop-calculator/_components/describeDayStopRule';
import { RulebookSkeleton } from '~/app/(app)/prop-calculator/accounts/_components/AccountsSkeleton';
import { ruleSourceListText } from '~/app/(app)/prop-calculator/accounts/_components/ruleSourceText';
import { StatusRow, StatusTone } from '~/components/StatusRow';
import { SwitchCard } from '~/components/ToggleCard';
import { ToolPanel } from '~/components/ToolPanel';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
} from '~/components/ui/field';
import InfoPopover from '~/components/ui/info-popover';
import { Input } from '~/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import { errorMessage } from '~/lib/errorMessage';
import { formatPercent } from '~/lib/format';
import { formatUsdCents, usdCents } from '~/lib/prop-accounts';
import { recordedAtLiveText } from '~/lib/prop-accounts/firms';
import { DayStopRuleKind, FirmId, fraction } from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    documentedRuleLabel,
    EvalSizingMode,
    HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS,
    LadderFractionSource,
    ReviewWeekday,
    RiskDisplayUnit,
    RULE_SOURCE_LABEL,
    rulebookDeviation,
    type RulebookParameters,
    RuleSource,
} from '~/lib/prop-calculator/advisor';
import { edgePlausibilityNoteText } from '~/lib/prop-calculator/economics';
import {
    isInvalidStoredRecord,
    PropRecord,
} from '~/lib/schemas/propAccountOutputs';
import { profileTabs, routes, withQuery } from '~/lib/site/routes';
import { api, type RouterOutputs } from '~/trpc/react';

import {
    comparableText,
    DEFAULT_FORM_VALUES,
    FieldKind,
    type HazardFieldName,
    hazardFieldName,
    hazardFieldSpec,
    type MeasuredHazard,
    parseText,
    rulebookFormSchema,
    type RulebookFormValues,
    rulebookToFormValues,
    TEXT_FIELDS,
    type TextFieldName,
    type TextFieldSpec,
} from './rulebookFormValues';
import {
    describeTradingPlanImportChange,
    rulebookFromTradingPlan,
    type TradingPlanImport,
    TradingPlanImportOutcome,
    type TradingPlanSource,
    TradingPlanSourceKind,
} from './rulebookFromTradingPlan';
import { useMeasuredHazards } from './useMeasuredHazards';

type StoredRulebook = RouterOutputs['propAccounts']['rulebook']['get'];

const FIX_FIELDS_MESSAGE = 'Fix the highlighted fields first';

const EVAL_MODE_OPTIONS: Readonly<
    Record<
        EvalSizingMode,
        { readonly label: string; readonly sources: readonly RuleSource[] }
    >
> = {
    [EvalSizingMode.Ladder]: {
        label: 'Ladder of rungs',
        sources: [RuleSource.GeneralDerivation],
    },
    [EvalSizingMode.MaxRisk]: {
        label: 'Max risk per trade, daily cap 2x risk',
        sources: [RuleSource.HardRule3, RuleSource.HardRule4],
    },
};

const LADDER_SOURCE_OPTIONS: Readonly<
    Record<
        LadderFractionSource,
        { readonly label: string; readonly source: RuleSource }
    >
> = {
    [LadderFractionSource.GeneralDerivation]: {
        label: 'General derivation: first rung of the cushion, then escalate',
        source: RuleSource.GeneralDerivation,
    },
    [LadderFractionSource.MffRapidEodSearch]: {
        label: 'From the MFF Rapid EOD 50K search, extrapolated to this plan',
        source: RuleSource.EvalLadder,
    },
};

const RISK_UNIT_LABEL: Readonly<Record<RiskDisplayUnit, string>> = {
    [RiskDisplayUnit.AccountDollars]: 'Account dollars',
    [RiskDisplayUnit.EvAtStake]: 'EV at stake',
    [RiskDisplayUnit.FeeEquivalent]: 'Fee equivalent (retry fees)',
};

const WEEKDAY_LABEL: Readonly<Record<ReviewWeekday, string>> = {
    [ReviewWeekday.Friday]: 'Friday',
    [ReviewWeekday.Monday]: 'Monday',
    [ReviewWeekday.Saturday]: 'Saturday',
    [ReviewWeekday.Sunday]: 'Sunday',
    [ReviewWeekday.Thursday]: 'Thursday',
    [ReviewWeekday.Tuesday]: 'Tuesday',
    [ReviewWeekday.Wednesday]: 'Wednesday',
};

const WEEKDAY_ORDER: readonly ReviewWeekday[] = [
    ReviewWeekday.Monday,
    ReviewWeekday.Tuesday,
    ReviewWeekday.Wednesday,
    ReviewWeekday.Thursday,
    ReviewWeekday.Friday,
    ReviewWeekday.Saturday,
    ReviewWeekday.Sunday,
];

const OUTCOME_LABEL: Readonly<Record<TradingPlanImportOutcome, string>> = {
    [TradingPlanImportOutcome.Applied]: 'will change',
    [TradingPlanImportOutcome.IgnoredZero]: 'ignored',
    [TradingPlanImportOutcome.NotStored]: 'not stored',
    [TradingPlanImportOutcome.Rejected]: 'rejected',
    [TradingPlanImportOutcome.Scaled]: 'will change',
    [TradingPlanImportOutcome.Unchanged]: 'same',
};

export function RulebookView({
    tradingPlan,
}: {
    tradingPlan: TradingPlanSource;
}) {
    const rulebookQuery = api.propAccounts.rulebook.get.useQuery();
    const [isOverwriting, setIsOverwriting] = useState(false);
    if (rulebookQuery.data !== undefined) {
        if (isOverwriting) setIsOverwriting(false);
        return (
            <RulebookForm
                stored={rulebookQuery.data}
                tradingPlan={tradingPlan}
            />
        );
    }
    if (
        isOverwriting &&
        (rulebookQuery.isPending ||
            isInvalidStoredRecord(rulebookQuery.error, PropRecord.Rulebook))
    ) {
        return <OverwriteRulebook tradingPlan={tradingPlan} />;
    }
    if (rulebookQuery.isPending) {
        return <RulebookSkeleton />;
    }
    if (!isInvalidStoredRecord(rulebookQuery.error, PropRecord.Rulebook)) {
        return <RulebookLoadError message={rulebookQuery.error.message} />;
    }
    return (
        <InvalidRulebookRepair
            message={rulebookQuery.error.message}
            onOverwrite={() => {
                setIsOverwriting(true);
            }}
        />
    );
}

function AlertsCard({ control }: { control: Control<RulebookFormValues> }) {
    return (
        <SectionCard title="Alerts">
            <TextField
                control={control}
                name="alerts.evalDaysRemainingWarning"
            />
            <TextField
                control={control}
                name="alerts.evalNearFloorDrawdownFraction"
            />
            <TextField
                control={control}
                name="alerts.fundedNearFloorRiskMultiple"
            />
            <TextField
                control={control}
                name="alerts.payoutReadyLossFraction"
            />
            <TextField
                control={control}
                name="alerts.payoutReadyRiskAboveRungCents"
            />
            <TextField
                control={control}
                name="alerts.dayLossBankrollFraction"
            />
            <TextField
                control={control}
                name="alerts.firmProfitConcentrationCount"
            />
            <TextField
                control={control}
                name="alerts.firmProfitConcentrationShare"
            />
        </SectionCard>
    );
}

function BankrollCard({ control }: { control: Control<RulebookFormValues> }) {
    return (
        <SectionCard title="Bankroll and scaling">
            <TextField control={control} name="bankroll.lossRiskThreshold" />
            <TextField control={control} name="bankroll.objectiveSwitchCents" />
            <TextField control={control} name="bankroll.dailyAccountCapacity" />
            <TextField control={control} name="bankroll.sessionHoursPerDay" />
            <TextField control={control} name="bankroll.accountsPerSession" />
            <TextField
                control={control}
                name="bankroll.defaultRoundBudgetCents"
            />
            <TextField control={control} name="bankroll.roundGapDays" />
        </SectionCard>
    );
}

function DeviationCard({ parsed }: { parsed: null | RulebookParameters }) {
    const deviation = parsed === null ? null : rulebookDeviation(parsed);
    return (
        <ToolPanel
            contentClassName="gap-3 text-sm"
            info={
                <p>
                    Eval risk is not a rulebook value:{' '}
                    {RULE_SOURCE_LABEL[RuleSource.HardRule3]} sizes evals to the
                    maximum allowed by the constraints.
                </p>
            }
            title="Deviations from the skill"
        >
            {deviation === null && (
                <p className="text-muted-foreground">
                    Fix the highlighted fields to see how this rulebook differs
                    from the skill.
                </p>
            )}
            {deviation?.length === 0 && (
                <p>
                    <Badge>Matches the skill</Badge> Headline label preview:
                    &ldquo;
                    {documentedRuleLabel(deviation)}&rdquo;.
                </p>
            )}
            {deviation !== null && deviation.length > 0 && (
                <>
                    <p>
                        Headline label preview: &ldquo;
                        {documentedRuleLabel(deviation)}&rdquo;.
                    </p>
                    <ul className="flex flex-wrap gap-2">
                        {deviation.map((source) => (
                            <li key={source}>
                                <Badge>{RULE_SOURCE_LABEL[source]}</Badge>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </ToolPanel>
    );
}

function DisplayCard({ control }: { control: Control<RulebookFormValues> }) {
    const formId = useId();
    return (
        <SectionCard title="Display">
            <Controller
                control={control}
                name="display.riskUnit"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel
                            className="flex items-center gap-2"
                            htmlFor={`${formId}-display.riskUnit`}
                        >
                            Show risk as
                            <InfoPopover title="Show risk as">
                                Your setting, not a skill rule, default{' '}
                                {RISK_UNIT_LABEL[
                                    DEFAULT_RULEBOOK.display.riskUnit
                                ].toLowerCase()}
                                .
                            </InfoPopover>
                        </FieldLabel>
                        <Select
                            onValueChange={field.onChange}
                            value={field.value}
                        >
                            <SelectTrigger
                                aria-invalid={fieldState.invalid}
                                id={`${formId}-display.riskUnit`}
                            >
                                <SelectValue>
                                    {RISK_UNIT_LABEL[field.value]}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {Object.values(RiskDisplayUnit).map((unit) => (
                                    <SelectItem key={unit} value={unit}>
                                        {RISK_UNIT_LABEL[unit]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FieldDescription>
                            The unit risk is shown in across the tools.
                        </FieldDescription>
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <TextField
                control={control}
                name="display.nextPayoutHighlightDays"
            />
        </SectionCard>
    );
}

function EvalCard({ control }: { control: Control<RulebookFormValues> }) {
    const formId = useId();
    const mode = useWatch({ control, name: 'eval.mode' });
    const ladderSource = useWatch({
        control,
        name: 'eval.ladderFractionSource',
    });
    return (
        <SectionCard
            info={
                <p>
                    Eval risk is not stored:{' '}
                    {RULE_SOURCE_LABEL[RuleSource.HardRule3]} sizes evals to the
                    maximum allowed by the constraints, paired with a daily
                    profit cap.
                </p>
            }
            title="Eval sizing"
        >
            <Controller
                control={control}
                name="eval.mode"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel
                            className="flex items-center gap-2"
                            htmlFor={`${formId}-eval.mode`}
                        >
                            Eval mode
                            <InfoPopover title="Eval mode">
                                Source:{' '}
                                {ruleSourceListText(
                                    mode === EvalSizingMode.Ladder
                                        ? [
                                              LADDER_SOURCE_OPTIONS[
                                                  ladderSource
                                              ].source,
                                          ]
                                        : EVAL_MODE_OPTIONS[mode].sources,
                                )}
                                . Default{' '}
                                {EVAL_MODE_OPTIONS[
                                    DEFAULT_RULEBOOK.eval.mode
                                ].label.toLowerCase()}
                                .
                            </InfoPopover>
                        </FieldLabel>
                        <Select
                            onValueChange={field.onChange}
                            value={field.value}
                        >
                            <SelectTrigger
                                aria-invalid={fieldState.invalid}
                                id={`${formId}-eval.mode`}
                            >
                                <SelectValue>
                                    {EVAL_MODE_OPTIONS[field.value].label}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {Object.values(EvalSizingMode).map((option) => (
                                    <SelectItem key={option} value={option}>
                                        {EVAL_MODE_OPTIONS[option].label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <Controller
                control={control}
                name="eval.ladderFractionSource"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel
                            className="flex items-center gap-2"
                            htmlFor={`${formId}-eval.ladderFractionSource`}
                        >
                            Ladder fractions
                            <InfoPopover title="Ladder fractions">
                                Source:{' '}
                                {
                                    RULE_SOURCE_LABEL[
                                        LADDER_SOURCE_OPTIONS[field.value]
                                            .source
                                    ]
                                }
                                .
                            </InfoPopover>
                        </FieldLabel>
                        <Select
                            onValueChange={field.onChange}
                            value={field.value}
                        >
                            <SelectTrigger
                                aria-invalid={fieldState.invalid}
                                id={`${formId}-eval.ladderFractionSource`}
                            >
                                <SelectValue>
                                    {LADDER_SOURCE_OPTIONS[field.value].label}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {Object.values(LadderFractionSource).map(
                                    (option) => (
                                        <SelectItem key={option} value={option}>
                                            {
                                                LADDER_SOURCE_OPTIONS[option]
                                                    .label
                                            }
                                        </SelectItem>
                                    ),
                                )}
                            </SelectContent>
                        </Select>
                        <FieldDescription>Ladder mode only.</FieldDescription>
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <TextField
                control={control}
                name="eval.generalDerivation.firstRungFraction"
            />
            <TextField
                control={control}
                name="eval.generalDerivation.escalation"
            />
            <TextField control={control} name="eval.mffSearchFractions" />
            <TextField control={control} name="eval.maxRiskDailyCapMultiple" />
            <TextField control={control} name="eval.roundingStepCents" />
        </SectionCard>
    );
}

function FundedCard({ control }: { control: Control<RulebookFormValues> }) {
    const formId = useId();
    const stopKind = useWatch({ control, name: 'funded.stopRule.kind' });
    return (
        <SectionCard title="Funded sizing">
            <TextField control={control} name="funded.riskCents" />
            <TextField control={control} name="funded.takeProfitCents" />
            <TextField control={control} name="funded.tradesPerDayMax" />
            <TextField control={control} name="execution.maxTradesPerWindow" />
            <Controller
                control={control}
                name="funded.stopRule.kind"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel
                            className="flex items-center gap-2"
                            htmlFor={`${formId}-funded.stopRule.kind`}
                        >
                            Funded day stop
                            <InfoPopover title="Funded day stop">
                                Source:{' '}
                                {RULE_SOURCE_LABEL[RuleSource.HisNumbers]},
                                default{' '}
                                {DAY_STOP_KIND_LABELS[
                                    DEFAULT_RULEBOOK.funded.stopRule.kind
                                ].toLowerCase()}
                                .
                            </InfoPopover>
                        </FieldLabel>
                        <Select
                            onValueChange={field.onChange}
                            value={field.value}
                        >
                            <SelectTrigger
                                aria-invalid={fieldState.invalid}
                                id={`${formId}-funded.stopRule.kind`}
                            >
                                <SelectValue>
                                    {DAY_STOP_KIND_LABELS[field.value]}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {Object.values(DayStopRuleKind).map((kind) => (
                                    <SelectItem key={kind} value={kind}>
                                        {DAY_STOP_KIND_LABELS[kind]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            {stopKind === DayStopRuleKind.AfterKLosses && (
                <TextField control={control} name="funded.stopRule.k" />
            )}
            {stopKind === DayStopRuleKind.AfterTarget && (
                <TextField
                    control={control}
                    name="funded.stopRule.targetCents"
                />
            )}
        </SectionCard>
    );
}

function HazardField({
    control,
    firmId,
    measured,
    unavailableText,
}: {
    control: Control<RulebookFormValues>;
    firmId: FirmId;
    measured: MeasuredHazard | undefined;
    unavailableText: string | undefined;
}) {
    return (
        <SpecField
            control={control}
            name={hazardFieldName(firmId)}
            renderFooter={(setText) => {
                if (measured !== undefined) {
                    return (
                        <MeasuredHazardNote
                            firmName={hazardFieldSpec(firmId).label}
                            measured={measured}
                            setText={setText}
                        />
                    );
                }
                return unavailableText === undefined ? null : (
                    <p className="text-xs text-muted-foreground">
                        Not measured: {unavailableText}
                    </p>
                );
            }}
            spec={hazardFieldSpec(firmId)}
        />
    );
}

function ImportCard({
    onApply,
    parsed,
    tradingPlan,
}: {
    onApply: (imported: TradingPlanImport) => void;
    parsed: null | RulebookParameters;
    tradingPlan: TradingPlanSource;
}) {
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const previewId = useId();
    const hintId = useId();
    const toggleRef = useRef<HTMLButtonElement>(null);
    const isToggleUnavailable = !isPreviewOpen && parsed === null;
    const closePreview = () => {
        setIsPreviewOpen(false);
        toggleRef.current?.focus();
    };
    return (
        <ToolPanel
            contentClassName="gap-3 text-sm"
            info={
                tradingPlan.kind === TradingPlanSourceKind.Ready ? (
                    <p>
                        Maps the funded risk and the max trades per window of
                        &ldquo;{tradingPlan.name}&rdquo; onto this rulebook. The
                        funded take profit scales with the risk, so the funded
                        reward multiple stays the same. Nothing is saved until
                        you save.
                    </p>
                ) : undefined
            }
            title="Import from your trade checklist"
        >
            {tradingPlan.kind === TradingPlanSourceKind.Missing && (
                <p className="text-muted-foreground">
                    You have no trading plan yet.{' '}
                    <Link
                        className="underline"
                        href={withQuery(routes.profile, {
                            tab: profileTabs.tradingPlan,
                        })}
                    >
                        Create one on your profile
                    </Link>{' '}
                    to import its risk settings.
                </p>
            )}
            {tradingPlan.kind === TradingPlanSourceKind.Unreadable && (
                <Alert variant="destructive">
                    <TriangleAlert />
                    <AlertTitle>
                        &ldquo;{tradingPlan.name}&rdquo; could not be read
                    </AlertTitle>
                    <AlertDescription>
                        Its saved settings do not pass validation, so nothing is
                        imported. Open and save it on your profile first.
                    </AlertDescription>
                </Alert>
            )}
            {tradingPlan.kind === TradingPlanSourceKind.Ready && (
                <>
                    <div>
                        <Button
                            aria-controls={previewId}
                            aria-describedby={
                                parsed === null ? hintId : undefined
                            }
                            aria-disabled={isToggleUnavailable || undefined}
                            aria-expanded={isPreviewOpen}
                            className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                            onClick={() => {
                                if (isToggleUnavailable) return;
                                setIsPreviewOpen(!isPreviewOpen);
                            }}
                            ref={toggleRef}
                            type="button"
                            variant="outline"
                        >
                            {isPreviewOpen
                                ? 'Hide import preview'
                                : 'Preview import'}
                        </Button>
                        {parsed === null && (
                            <p
                                className="mt-2 text-xs text-muted-foreground"
                                id={hintId}
                            >
                                {FIX_FIELDS_MESSAGE}.
                            </p>
                        )}
                    </div>
                    <div
                        aria-label="Import preview"
                        aria-live="polite"
                        id={previewId}
                        role="region"
                    >
                        {isPreviewOpen && parsed !== null && (
                            <ImportPreview
                                imported={rulebookFromTradingPlan(
                                    parsed,
                                    tradingPlan.risk,
                                )}
                                onApply={(imported) => {
                                    onApply(imported);
                                    closePreview();
                                }}
                                onCancel={closePreview}
                            />
                        )}
                    </div>
                </>
            )}
        </ToolPanel>
    );
}

function ImportPreview({
    imported,
    onApply,
    onCancel,
}: {
    imported: TradingPlanImport;
    onApply: (imported: TradingPlanImport) => void;
    onCancel: () => void;
}) {
    const { added, after, cleared } = imported.deviation;
    return (
        <Card className="gap-3 p-4">
            <ul className="flex flex-col gap-2">
                {imported.changes.map((change) => (
                    <li className="flex items-start gap-2" key={change.field}>
                        <Badge>{OUTCOME_LABEL[change.outcome]}</Badge>
                        <span>{describeTradingPlanImportChange(change)}</span>
                    </li>
                ))}
            </ul>
            {added.length > 0 && (
                <p>
                    New deviations from the skill: {ruleSourceListText(added)}.
                </p>
            )}
            {cleared.length > 0 && (
                <p>
                    Back in line with the skill: {ruleSourceListText(cleared)}.
                </p>
            )}
            <p className="text-muted-foreground">
                Headline label preview after the import: &ldquo;
                {documentedRuleLabel(after)}&rdquo;.
            </p>
            <div className="flex flex-wrap gap-2">
                <Button
                    disabled={!imported.hasChanges}
                    onClick={() => {
                        onApply(imported);
                    }}
                    type="button"
                >
                    Apply to the form
                </Button>
                <Button onClick={onCancel} type="button" variant="ghost">
                    Cancel
                </Button>
            </div>
        </Card>
    );
}

function InvalidRulebookRepair({
    message,
    onOverwrite,
}: {
    message: string;
    onOverwrite: () => void;
}) {
    const rulebookReset = useRulebookReset();
    return (
        <div className="flex flex-col gap-4">
            <RulebookLoadError message={message} />
            <div className="flex flex-wrap items-center gap-2">
                <ResetRulebookDialog
                    disabled={rulebookReset.isPending}
                    onConfirm={() => {
                        void rulebookReset.reset();
                    }}
                />
                <Button
                    disabled={rulebookReset.isPending}
                    onClick={onOverwrite}
                    type="button"
                >
                    Overwrite with a new rulebook
                </Button>
            </div>
        </div>
    );
}

function LiveCard({ control }: { control: Control<RulebookFormValues> }) {
    return (
        <SectionCard title="Live sizing">
            <TextField control={control} name="live.cushionPercent.preLock" />
            <TextField control={control} name="live.cushionPercent.postLock" />
        </SectionCard>
    );
}

function LiveTransferCard({
    control,
}: {
    control: Control<RulebookFormValues>;
}) {
    const { failed, measured, pending, unavailable } = useMeasuredHazards();
    return (
        <SectionCard
            info={
                <p>
                    Your estimate of the chance, per paid payout, that a firm
                    moves a funded account to live. No firm publishes this
                    number. A rate entered for a firm is applied to every
                    simulation built from your rulebook for that firm&apos;s
                    accounts: the advisor&apos;s account value runs, the payout
                    planner and its withdrawal-size table, the overview
                    projections and next-payout figures, retire comparisons,
                    risk candidates and copy-group runs. Only the advisor&apos;s
                    run note states it beside its figures; the other surfaces
                    apply it without repeating it. A firm with no rate is priced
                    with none. The portfolio timeline does not price transfers,
                    and the calculator takes its own single hazard in its
                    advanced settings.
                </p>
            }
            isComputing={pending}
            title="Live transfer (your assumption, not a firm rule)"
        >
            {failed && (
                <p
                    className="text-xs text-destructive md:col-span-2"
                    role="status"
                >
                    Measured rates unavailable: your ledger could not be loaded,
                    so no measured rate is suggested.
                </p>
            )}
            {Object.values(FirmId).map((firmId) => (
                <HazardField
                    control={control}
                    firmId={firmId}
                    key={firmId}
                    measured={measured[firmId]}
                    unavailableText={unavailable[firmId]?.text}
                />
            ))}
        </SectionCard>
    );
}

function MeasuredHazardNote({
    firmName,
    measured,
    setText,
}: {
    firmName: string;
    measured: MeasuredHazard;
    setText: (text: string) => void;
}) {
    const { suggestedText } = measured;
    return (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
                Measured: {formatPercent(measured.rate)} per paid payout (
                {measured.movedLiveCount} sent live in {measured.paidPayouts}{' '}
                paid payouts
                {measured.recordedAtLiveCount > 0 &&
                    `, ${recordedAtLiveText(measured.recordedAtLiveCount)}`}
                ), from your own ledger. History, not a firm rule.
            </span>
            {suggestedText !== null && (
                <Button
                    aria-label={`Use ${suggestedText}% for ${firmName}`}
                    onClick={() => {
                        setText(suggestedText);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                >
                    Use {suggestedText}%
                </Button>
            )}
        </div>
    );
}

function OverwriteRulebook({
    tradingPlan,
}: {
    tradingPlan: TradingPlanSource;
}) {
    return (
        <div className="flex flex-col gap-6">
            <StatusRow
                detail="Your stored rulebook could not be read. Saving replaces your stored rulebook with this one."
                title="Starting from the skill defaults"
                tone={StatusTone.Warn}
            />
            <RulebookForm stored={DEFAULT_RULEBOOK} tradingPlan={tradingPlan} />
        </div>
    );
}

function PayoutCard({ control }: { control: Control<RulebookFormValues> }) {
    const formId = useId();
    const isBelowHardRule2Allowed = useWatch({
        control,
        name: 'payout.allowBelowHardRule2',
    });
    return (
        <SectionCard title="Payouts">
            <TextField control={control} name="payout.requestCents" />
            <TextField control={control} name="payout.retainedCushionCents" />
            <Controller
                control={control}
                name="payout.allowBelowHardRule2"
                render={({ field, fieldState }) => (
                    <Field
                        className="md:col-span-2"
                        data-invalid={fieldState.invalid}
                    >
                        <SwitchCard
                            aria-invalid={fieldState.invalid}
                            checked={field.value}
                            id={`${formId}-payout.allowBelowHardRule2`}
                            label={`Allow a retained cushion below ${RULE_SOURCE_LABEL[RuleSource.HardRule2]}`}
                            onCheckedChange={field.onChange}
                        />
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            {isBelowHardRule2Allowed && (
                <StatusRow
                    className="md:col-span-2"
                    detail={`Never withdraw below ${formatUsdCents(usdCents(HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS))} of remaining cushion: that is ${RULE_SOURCE_LABEL[RuleSource.HardRule2]}. With the override on, a lower retained cushion is saved and listed as a deviation from ${RULE_SOURCE_LABEL[RuleSource.HardRule2]}.`}
                    title={`This breaks ${RULE_SOURCE_LABEL[RuleSource.HardRule2]}`}
                    tone={StatusTone.Warn}
                />
            )}
        </SectionCard>
    );
}

function PlausibilityCard({
    control,
}: {
    control: Control<RulebookFormValues>;
}) {
    return (
        <SectionCard title="Plausibility">
            <TextField
                control={control}
                name="plausibility.typicalMaxExpectancyR"
            />
            <TextField
                control={control}
                name="plausibility.strongMaxExpectancyR"
            />
        </SectionCard>
    );
}

function ResetRulebookDialog({
    disabled,
    onConfirm,
}: {
    disabled: boolean;
    onConfirm: () => void;
}) {
    return (
        <ConfirmDialog
            confirmLabel="Reset"
            description="This deletes your saved rulebook. Every value goes back to the skill defaults, so the rulebook no longer differs from the skill."
            onConfirm={onConfirm}
            title="Reset the rulebook?"
        >
            <Button disabled={disabled} type="button" variant="outline">
                Reset to skill defaults
            </Button>
        </ConfirmDialog>
    );
}

function ReviewCard({ control }: { control: Control<RulebookFormValues> }) {
    const formId = useId();
    return (
        <SectionCard title="Review">
            <Controller
                control={control}
                name="review.weekday"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel
                            className="flex items-center gap-2"
                            htmlFor={`${formId}-review.weekday`}
                        >
                            Weekly review day
                            <InfoPopover title="Weekly review day">
                                Source:{' '}
                                {
                                    RULE_SOURCE_LABEL[
                                        RuleSource.ReassessmentCadence
                                    ]
                                }
                                , default{' '}
                                {WEEKDAY_LABEL[DEFAULT_RULEBOOK.review.weekday]}
                                .
                            </InfoPopover>
                        </FieldLabel>
                        <Select
                            onValueChange={field.onChange}
                            value={field.value}
                        >
                            <SelectTrigger
                                aria-invalid={fieldState.invalid}
                                id={`${formId}-review.weekday`}
                            >
                                <SelectValue>
                                    {WEEKDAY_LABEL[field.value]}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {WEEKDAY_ORDER.map((weekday) => (
                                    <SelectItem key={weekday} value={weekday}>
                                        {WEEKDAY_LABEL[weekday]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <TextField control={control} name="review.fundedStaleDays" />
        </SectionCard>
    );
}

function rulebookEdgePlausibilityNote(
    winrateText: string,
    rrText: string,
    typicalText: string,
    strongText: string,
    tradesPerDayText: string,
): null | string {
    const tradesPerDayParsed = parseText(FieldKind.Count, tradesPerDayText);
    const winrateParsed = parseText(FieldKind.Percent, winrateText);
    const rrParsed = parseText(FieldKind.Decimal, rrText);
    const typicalParsed = parseText(FieldKind.Decimal, typicalText);
    const strongParsed = parseText(FieldKind.Decimal, strongText);
    if (
        !winrateParsed.ok ||
        !rrParsed.ok ||
        !typicalParsed.ok ||
        !strongParsed.ok ||
        typeof winrateParsed.value !== 'number' ||
        typeof rrParsed.value !== 'number' ||
        typeof typicalParsed.value !== 'number' ||
        typeof strongParsed.value !== 'number'
    ) {
        return null;
    }
    return edgePlausibilityNoteText(
        {
            rrRatio: rrParsed.value,
            tradesPerDay:
                tradesPerDayParsed.ok &&
                typeof tradesPerDayParsed.value === 'number'
                    ? tradesPerDayParsed.value
                    : undefined,
            winrate: fraction(winrateParsed.value),
        },
        {
            strongMaxExpectancyR: strongParsed.value,
            typicalMaxExpectancyR: typicalParsed.value,
        },
    );
}

function RulebookForm({
    stored,
    tradingPlan,
}: {
    stored: StoredRulebook;
    tradingPlan: TradingPlanSource;
}) {
    const utilities = api.useUtils();
    const upsert = api.propAccounts.rulebook.upsert.useMutation();
    const rulebookReset = useRulebookReset();
    const form = useForm<RulebookFormValues>({
        defaultValues: rulebookToFormValues(stored),
        resolver: zodResolver(rulebookFormSchema, undefined, { raw: true }),
    });
    const values = useWatch({ control: form.control });
    const current = rulebookFormSchema.safeParse(values);
    const parsed = current.success ? current.data : null;
    const isSaving = upsert.isPending || rulebookReset.isPending;

    const onSubmit = form.handleSubmit(
        async (raw) => {
            const draft = rulebookFormSchema.safeParse(raw);
            if (!draft.success) {
                toast.error(FIX_FIELDS_MESSAGE);
                return;
            }
            try {
                const saved = await upsert.mutateAsync(draft.data);
                form.reset(rulebookToFormValues(saved));
                toast.success('Rulebook saved');
            } catch (error) {
                toast.error(errorMessage(error));
            } finally {
                await utilities.propAccounts.invalidate();
            }
        },
        () => {
            toast.error(FIX_FIELDS_MESSAGE);
        },
    );

    const resetToDefaults = async () => {
        await rulebookReset.reset(() => {
            form.reset(rulebookToFormValues(DEFAULT_RULEBOOK));
        });
    };

    const applyImport = (imported: TradingPlanImport) => {
        form.reset(rulebookToFormValues(imported.rulebook), {
            keepDefaultValues: true,
        });
        toast.success('Imported into the form. Save to keep it.');
    };

    return (
        <form
            className="app-prop-accounts__rulebook-form flex flex-col gap-6"
            noValidate
            onSubmit={(event) => {
                void onSubmit(event);
            }}
        >
            <DeviationCard parsed={parsed} />
            <ImportCard
                onApply={applyImport}
                parsed={parsed}
                tradingPlan={tradingPlan}
            />
            <StrategyCard control={form.control} />
            <PlausibilityCard control={form.control} />
            <EvalCard control={form.control} />
            <FundedCard control={form.control} />
            <PayoutCard control={form.control} />
            <LiveCard control={form.control} />
            <ReviewCard control={form.control} />
            <TargetsCard control={form.control} />
            <AlertsCard control={form.control} />
            <BankrollCard control={form.control} />
            <SamplesCard control={form.control} />
            <DisplayCard control={form.control} />
            <LiveTransferCard control={form.control} />

            {form.formState.errors.root?.message !== undefined && (
                <p className="text-sm text-destructive" role="alert">
                    {form.formState.errors.root.message}
                </p>
            )}

            <div
                className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-border bg-background/95 py-3 backdrop-blur-sm"
                {...STICKY_ACTION_BAR_PROPS}
            >
                <Button disabled={isSaving} type="submit">
                    Save rulebook
                </Button>
                <Button
                    disabled={isSaving || !form.formState.isDirty}
                    onClick={() => {
                        form.reset();
                    }}
                    type="button"
                    variant="ghost"
                >
                    Discard changes
                </Button>
                {form.formState.isDirty && (
                    <p className="text-sm text-warning" role="status">
                        Unsaved changes
                    </p>
                )}
            </div>
            <div>
                <ResetRulebookDialog
                    disabled={isSaving}
                    onConfirm={() => {
                        void resetToDefaults();
                    }}
                />
            </div>
        </form>
    );
}

function RulebookLoadError({ message }: { message: string }) {
    return (
        <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>The rulebook could not be loaded</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
        </Alert>
    );
}

function SamplesCard({ control }: { control: Control<RulebookFormValues> }) {
    return (
        <SectionCard title="Samples">
            <TextField control={control} name="samples.minEvalAttempts" />
            <TextField control={control} name="samples.minFundedAccounts" />
            <TextField control={control} name="samples.minEndedAccounts" />
            <TextField control={control} name="samples.minTrades" />
            <TextField control={control} name="samples.minClosedRounds" />
        </SectionCard>
    );
}

function SectionCard({
    children,
    info,
    isComputing = false,
    title,
}: {
    children: ReactNode;
    info?: ReactNode;
    isComputing?: boolean;
    title: string;
}) {
    return (
        <ToolPanel
            contentClassName="grid gap-4 md:grid-cols-2"
            info={info}
            isComputing={isComputing}
            title={title}
        >
            {children}
        </ToolPanel>
    );
}

function settingNote(spec: TextFieldSpec): string {
    if (spec.source !== null) {
        return `Source: ${RULE_SOURCE_LABEL[spec.source]}, default ${spec.read(DEFAULT_FORM_VALUES)}.`;
    }
    return spec.isOptional
        ? 'Your setting, not a skill rule. Empty means not set.'
        : `Your setting, not a skill rule, default ${spec.read(DEFAULT_FORM_VALUES)}.`;
}

function SpecField({
    control,
    name,
    renderFooter,
    spec,
}: {
    control: Control<RulebookFormValues>;
    name: HazardFieldName | TextFieldName;
    renderFooter?: (setText: (text: string) => void) => ReactNode;
    spec: TextFieldSpec;
}) {
    const formId = useId();
    const defaultComparable = comparableText(
        spec.kind,
        spec.read(DEFAULT_FORM_VALUES),
    );
    return (
        <Controller
            control={control}
            name={name}
            render={({ field, fieldState }) => {
                const valueComparable = comparableText(spec.kind, field.value);
                const isCustom =
                    spec.source !== null &&
                    defaultComparable !== null &&
                    valueComparable !== null &&
                    valueComparable !== defaultComparable;
                return (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel
                            className="flex items-center gap-2"
                            htmlFor={`${formId}-${field.name}`}
                        >
                            {spec.label}
                            {spec.kind === FieldKind.Money && ' ($)'}
                            {spec.kind === FieldKind.Percent && ' (%)'}
                            {isCustom && <Badge>custom</Badge>}
                            <InfoPopover title={spec.label}>
                                {settingNote(spec)}
                            </InfoPopover>
                        </FieldLabel>
                        <Input
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-${field.name}`}
                            inputMode={
                                spec.kind === FieldKind.Count
                                    ? 'numeric'
                                    : 'decimal'
                            }
                            {...field}
                        />
                        <FieldDescription>{spec.hint}</FieldDescription>
                        {renderFooter?.(field.onChange)}
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                );
            }}
        />
    );
}

function StrategyCard({ control }: { control: Control<RulebookFormValues> }) {
    const winrateText = useWatch({ control, name: 'strategy.winrate' });
    const rrText = useWatch({ control, name: 'strategy.rr' });
    const typicalText = useWatch({
        control,
        name: 'plausibility.typicalMaxExpectancyR',
    });
    const strongText = useWatch({
        control,
        name: 'plausibility.strongMaxExpectancyR',
    });
    const tradesPerDayText = useWatch({
        control,
        name: 'strategy.tradesPerDayMax',
    });
    const note = rulebookEdgePlausibilityNote(
        winrateText,
        rrText,
        typicalText,
        strongText,
        tradesPerDayText,
    );
    return (
        <SectionCard title="Strategy">
            <TextField control={control} name="strategy.winrate" />
            <TextField control={control} name="strategy.rr" />
            <TextField control={control} name="strategy.tradesPerDayMax" />
            <p className="text-xs text-warning" role="status">
                {note ?? ''}
            </p>
        </SectionCard>
    );
}

function TargetsCard({ control }: { control: Control<RulebookFormValues> }) {
    return (
        <SectionCard title="Targets">
            <TextField
                control={control}
                name="review.monthlyPayoutTargetCents"
            />
            <TextField control={control} name="review.targetMonthlyMultiple" />
        </SectionCard>
    );
}

function TextField({
    control,
    name,
}: {
    control: Control<RulebookFormValues>;
    name: TextFieldName;
}) {
    return <SpecField control={control} name={name} spec={TEXT_FIELDS[name]} />;
}

function useRulebookReset() {
    const utilities = api.useUtils();
    const resetRulebook = api.propAccounts.rulebook.reset.useMutation();
    const reset = async (onReset?: () => void) => {
        try {
            await resetRulebook.mutateAsync();
            onReset?.();
            toast.success('Rulebook reset to the skill defaults');
        } catch (error) {
            toast.error(errorMessage(error));
        } finally {
            await utilities.propAccounts.invalidate();
        }
    };
    return { isPending: resetRulebook.isPending, reset };
}
