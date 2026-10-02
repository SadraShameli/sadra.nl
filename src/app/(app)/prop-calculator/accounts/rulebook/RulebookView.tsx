'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useId, useRef, useState } from 'react';
import { type Control, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { DAY_STOP_KIND_LABELS } from '~/app/(app)/prop-calculator/_components/describeDayStopRule';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '~/components/ui/AlertDialog';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '~/components/ui/Form';
import { Input } from '~/components/ui/Input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import { Skeleton } from '~/components/ui/Skeleton';
import { Switch } from '~/components/ui/Switch';
import { errorMessage } from '~/lib/errorMessage';
import { formatPercent } from '~/lib/format';
import { formatUsdCents, usdCents } from '~/lib/prop-accounts';
import { DayStopRuleKind, FirmId, fraction } from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    documentedRuleLabel,
    EvalSizingMode,
    HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS,
    LadderFractionSource,
    ReviewWeekday,
    RiskDisplayUnit,
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
import { cn } from '~/lib/utilities';
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

const OUTCOME_BADGE: Readonly<
    Record<
        TradingPlanImportOutcome,
        {
            readonly label: string;
            readonly variant:
                'default' | 'destructive' | 'outline' | 'secondary';
        }
    >
> = {
    [TradingPlanImportOutcome.Applied]: {
        label: 'will change',
        variant: 'default',
    },
    [TradingPlanImportOutcome.IgnoredZero]: {
        label: 'ignored',
        variant: 'outline',
    },
    [TradingPlanImportOutcome.NotStored]: {
        label: 'not stored',
        variant: 'outline',
    },
    [TradingPlanImportOutcome.Rejected]: {
        label: 'rejected',
        variant: 'destructive',
    },
    [TradingPlanImportOutcome.Scaled]: {
        label: 'will change',
        variant: 'default',
    },
    [TradingPlanImportOutcome.Unchanged]: {
        label: 'same',
        variant: 'secondary',
    },
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
    if (rulebookQuery.isPending) return <Skeleton className="h-96 w-full" />;
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
        <Card>
            <CardHeader>
                <CardTitle>Deviations from the skill</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
                {deviation === null && (
                    <p className="text-muted-foreground">
                        Fix the highlighted fields to see how this rulebook
                        differs from the skill.
                    </p>
                )}
                {deviation?.length === 0 && (
                    <p>
                        <Badge variant="success">Matches the skill</Badge>{' '}
                        Headline label preview: &ldquo;
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
                                    <Badge variant="warning">{source}</Badge>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
                <p className="text-xs text-muted-foreground">
                    Eval risk is not a rulebook value: {RuleSource.HardRule3}{' '}
                    sizes evals to the maximum allowed by the constraints.
                </p>
            </CardContent>
        </Card>
    );
}

function DisplayCard({ control }: { control: Control<RulebookFormValues> }) {
    return (
        <SectionCard title="Display">
            <FormField
                control={control}
                name="display.riskUnit"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Show risk as</FormLabel>
                        <Select
                            onValueChange={field.onChange}
                            value={field.value}
                        >
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {Object.values(RiskDisplayUnit).map((unit) => (
                                    <SelectItem key={unit} value={unit}>
                                        {RISK_UNIT_LABEL[unit]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormDescription>
                            The unit risk is shown in across the tools. Your
                            setting, not a skill rule, default{' '}
                            {RISK_UNIT_LABEL[
                                DEFAULT_RULEBOOK.display.riskUnit
                            ].toLowerCase()}
                            .
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                )}
            />
            <TextField control={control} name="display.nextPayoutHighlightDays" />
        </SectionCard>
    );
}

function EvalCard({ control }: { control: Control<RulebookFormValues> }) {
    const mode = useWatch({ control, name: 'eval.mode' });
    const ladderSource = useWatch({
        control,
        name: 'eval.ladderFractionSource',
    });
    return (
        <SectionCard title="Eval sizing">
            <FormField
                control={control}
                name="eval.mode"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Eval mode</FormLabel>
                        <Select
                            onValueChange={field.onChange}
                            value={field.value}
                        >
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {Object.values(EvalSizingMode).map((option) => (
                                    <SelectItem key={option} value={option}>
                                        {EVAL_MODE_OPTIONS[option].label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormDescription>
                            Skill:{' '}
                            {mode === EvalSizingMode.Ladder
                                ? LADDER_SOURCE_OPTIONS[ladderSource].source
                                : EVAL_MODE_OPTIONS[mode].sources.join(', ')}
                            . Default{' '}
                            {EVAL_MODE_OPTIONS[
                                DEFAULT_RULEBOOK.eval.mode
                            ].label.toLowerCase()}
                            .
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                )}
            />
            <FormField
                control={control}
                name="eval.ladderFractionSource"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Ladder fractions</FormLabel>
                        <Select
                            onValueChange={field.onChange}
                            value={field.value}
                        >
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                            </FormControl>
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
                        <FormDescription>
                            Ladder mode only. Skill:{' '}
                            {LADDER_SOURCE_OPTIONS[field.value].source}.
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
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
            <p className="text-xs text-muted-foreground md:col-span-2">
                Eval risk is not stored: {RuleSource.HardRule3} sizes evals to
                the maximum allowed by the constraints, paired with a daily
                profit cap.
            </p>
        </SectionCard>
    );
}

function FundedCard({ control }: { control: Control<RulebookFormValues> }) {
    const stopKind = useWatch({ control, name: 'funded.stopRule.kind' });
    return (
        <SectionCard title="Funded sizing">
            <TextField control={control} name="funded.riskCents" />
            <TextField control={control} name="funded.takeProfitCents" />
            <TextField control={control} name="funded.tradesPerDayMax" />
            <TextField control={control} name="execution.maxTradesPerWindow" />
            <FormField
                control={control}
                name="funded.stopRule.kind"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Funded day stop</FormLabel>
                        <Select
                            onValueChange={field.onChange}
                            value={field.value}
                        >
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {Object.values(DayStopRuleKind).map((kind) => (
                                    <SelectItem key={kind} value={kind}>
                                        {DAY_STOP_KIND_LABELS[kind]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormDescription>
                            Skill: {RuleSource.HisNumbers}, default{' '}
                            {DAY_STOP_KIND_LABELS[
                                DEFAULT_RULEBOOK.funded.stopRule.kind
                            ].toLowerCase()}
                            .
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
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
}: {
    control: Control<RulebookFormValues>;
    firmId: FirmId;
    measured: MeasuredHazard | undefined;
}) {
    return (
        <SpecField
            control={control}
            name={hazardFieldName(firmId)}
            renderFooter={(setText) =>
                measured === undefined ? null : (
                    <MeasuredHazardNote
                        firmName={hazardFieldSpec(firmId).label}
                        measured={measured}
                        setText={setText}
                    />
                )
            }
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
        <Card>
            <CardHeader>
                <CardTitle>Import from your trade checklist</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
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
                            Its saved settings do not pass validation, so
                            nothing is imported. Open and save it on your
                            profile first.
                        </AlertDescription>
                    </Alert>
                )}
                {tradingPlan.kind === TradingPlanSourceKind.Ready && (
                    <>
                        <p className="text-muted-foreground">
                            Maps the funded risk and the max trades per window
                            of &ldquo;{tradingPlan.name}&rdquo; onto this
                            rulebook. The funded take profit scales with the
                            risk, so the funded reward multiple stays the same.
                            Nothing is saved until you save.
                        </p>
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
            </CardContent>
        </Card>
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
        <div className="flex flex-col gap-3 rounded-md border p-4">
            <ul className="flex flex-col gap-2">
                {imported.changes.map((change) => (
                    <li className="flex items-start gap-2" key={change.field}>
                        <Badge variant={OUTCOME_BADGE[change.outcome].variant}>
                            {OUTCOME_BADGE[change.outcome].label}
                        </Badge>
                        <span>{describeTradingPlanImportChange(change)}</span>
                    </li>
                ))}
            </ul>
            {added.length > 0 && (
                <p>New deviations from the skill: {added.join(', ')}.</p>
            )}
            {cleared.length > 0 && (
                <p>Back in line with the skill: {cleared.join(', ')}.</p>
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
        </div>
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
    const { failed, measured, pending } = useMeasuredHazards();
    return (
        <SectionCard title="Live transfer (your assumption, not a firm rule)">
            <p className="text-xs text-muted-foreground md:col-span-2">
                Your estimate of the chance, per paid payout, that a firm moves
                a funded account to live. No firm publishes this number. A rate
                entered for a firm is applied to every simulation built from
                your rulebook for that firm&apos;s accounts: the
                advisor&apos;s account value runs, the payout planner and its
                withdrawal-size table, the overview projections and next-payout
                figures, retire comparisons, risk candidates and copy-group
                runs. Only the advisor&apos;s run note states it beside its
                figures; the other surfaces apply it without repeating it. A
                firm with no rate is priced with none. The portfolio timeline
                does not price transfers, and the calculator takes its own
                single hazard in its advanced settings.
            </p>
            {pending && (
                <p
                    className="text-xs text-muted-foreground md:col-span-2"
                    role="status"
                >
                    Loading your measured rates from your ledger.
                </p>
            )}
            {failed && (
                <p
                    className="text-xs text-destructive md:col-span-2"
                    role="status"
                >
                    Measured rates unavailable: your ledger could not be
                    loaded, so no measured rate is suggested.
                </p>
            )}
            {Object.values(FirmId).map((firmId) => (
                <HazardField
                    control={control}
                    firmId={firmId}
                    key={firmId}
                    measured={measured[firmId]}
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
                paid payouts), from your own ledger. History, not a firm rule.
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
            <Alert variant="warning">
                <TriangleAlert />
                <AlertTitle>Starting from the skill defaults</AlertTitle>
                <AlertDescription>
                    Your stored rulebook could not be read. Saving replaces your
                    stored rulebook with this one.
                </AlertDescription>
            </Alert>
            <RulebookForm stored={DEFAULT_RULEBOOK} tradingPlan={tradingPlan} />
        </div>
    );
}

function PayoutCard({ control }: { control: Control<RulebookFormValues> }) {
    const isBelowHardRule2Allowed = useWatch({
        control,
        name: 'payout.allowBelowHardRule2',
    });
    return (
        <SectionCard title="Payouts">
            <TextField control={control} name="payout.requestCents" />
            <TextField control={control} name="payout.retainedCushionCents" />
            <FormField
                control={control}
                name="payout.allowBelowHardRule2"
                render={({ field }) => (
                    <FormItem className="md:col-span-2">
                        <div className="flex items-center gap-2">
                            <FormControl>
                                <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                            </FormControl>
                            <FormLabel>
                                Allow a retained cushion below{' '}
                                {RuleSource.HardRule2}
                            </FormLabel>
                        </div>
                        <FormMessage />
                    </FormItem>
                )}
            />
            {isBelowHardRule2Allowed && (
                <Alert className="md:col-span-2" variant="warning">
                    <TriangleAlert />
                    <AlertTitle>This breaks {RuleSource.HardRule2}</AlertTitle>
                    <AlertDescription>
                        {RuleSource.HardRule2}: never withdraw below{' '}
                        {formatUsdCents(
                            usdCents(HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS),
                        )}{' '}
                        remaining cushion. With the override on, a lower
                        retained cushion is saved and listed as a deviation from{' '}
                        {RuleSource.HardRule2}.
                    </AlertDescription>
                </Alert>
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
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button disabled={disabled} type="button" variant="outline">
                    Reset to skill defaults
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Reset the rulebook?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This deletes your saved rulebook. Every value goes back
                        to the skill defaults, so the rulebook no longer differs
                        from the skill.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>
                        Reset
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function ReviewCard({ control }: { control: Control<RulebookFormValues> }) {
    return (
        <SectionCard title="Review">
            <FormField
                control={control}
                name="review.weekday"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Weekly review day</FormLabel>
                        <Select
                            onValueChange={field.onChange}
                            value={field.value}
                        >
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {WEEKDAY_ORDER.map((weekday) => (
                                    <SelectItem key={weekday} value={weekday}>
                                        {WEEKDAY_LABEL[weekday]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormDescription>
                            Skill: {RuleSource.ReassessmentCadence}, default{' '}
                            {WEEKDAY_LABEL[DEFAULT_RULEBOOK.review.weekday]}.
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
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
): null | string {
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
        { rrRatio: rrParsed.value, winrate: fraction(winrateParsed.value) },
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
        <Form {...form}>
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

                <div className="flex flex-wrap items-center gap-2">
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
                    <ResetRulebookDialog
                        disabled={isSaving}
                        onConfirm={() => {
                            void resetToDefaults();
                        }}
                    />
                </div>
            </form>
        </Form>
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
    title,
}: {
    children: ReactNode;
    title: string;
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent className={cn('grid gap-4 md:grid-cols-2')}>
                {children}
            </CardContent>
        </Card>
    );
}

function settingNote(spec: TextFieldSpec): string {
    if (spec.source !== null) {
        return `Skill: ${spec.source}, default ${spec.read(DEFAULT_FORM_VALUES)}.`;
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
    const defaultComparable = comparableText(
        spec.kind,
        spec.read(DEFAULT_FORM_VALUES),
    );
    return (
        <FormField
            control={control}
            name={name}
            render={({ field }) => {
                const valueComparable = comparableText(spec.kind, field.value);
                const isCustom =
                    spec.source !== null &&
                    defaultComparable !== null &&
                    valueComparable !== null &&
                    valueComparable !== defaultComparable;
                return (
                    <FormItem>
                        <FormLabel className="flex items-center gap-2">
                            {spec.label}
                            {spec.kind === FieldKind.Money && ' ($)'}
                            {spec.kind === FieldKind.Percent && ' (%)'}
                            {isCustom && (
                                <Badge variant="warning">custom</Badge>
                            )}
                        </FormLabel>
                        <FormControl>
                            <Input
                                inputMode={
                                    spec.kind === FieldKind.Count
                                        ? 'numeric'
                                        : 'decimal'
                                }
                                {...field}
                            />
                        </FormControl>
                        <FormDescription>
                            {spec.hint} {settingNote(spec)}
                        </FormDescription>
                        {renderFooter?.(field.onChange)}
                        <FormMessage />
                    </FormItem>
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
    const note = rulebookEdgePlausibilityNote(
        winrateText,
        rrText,
        typicalText,
        strongText,
    );
    return (
        <SectionCard title="Strategy">
            <TextField control={control} name="strategy.winrate" />
            <TextField control={control} name="strategy.rr" />
            <TextField control={control} name="strategy.tradesPerDayMax" />
            <p className="text-xs text-amber-400" role="status">
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
