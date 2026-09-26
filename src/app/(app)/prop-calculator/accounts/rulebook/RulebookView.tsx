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
import { formatUsdCents, usdCents } from '~/lib/prop-accounts';
import { DayStopRuleKind } from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    documentedRuleLabel,
    EvalSizingMode,
    HARD_RULE_2_MIN_RETAINED_CUSHION_CENTS,
    LadderFractionSource,
    ReviewWeekday,
    rulebookDeviation,
    type RulebookParameters,
    RuleSource,
} from '~/lib/prop-calculator/advisor';
import { profileTabs, routes, withQuery } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api, type RouterOutputs } from '~/trpc/react';

import {
    comparableText,
    DEFAULT_FORM_VALUES,
    FieldKind,
    rulebookFormSchema,
    type RulebookFormValues,
    rulebookToFormValues,
    TEXT_FIELDS,
    type TextFieldName,
} from './rulebookFormValues';
import {
    describeTradingPlanImportChange,
    rulebookFromTradingPlan,
    type TradingPlanImport,
    TradingPlanImportOutcome,
    type TradingPlanSource,
    TradingPlanSourceKind,
} from './rulebookFromTradingPlan';

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
    if (rulebookQuery.isPending) return <Skeleton className="h-96 w-full" />;
    if (rulebookQuery.isError) {
        return (
            <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>The rulebook could not be loaded</AlertTitle>
                <AlertDescription>
                    {rulebookQuery.error.message}
                </AlertDescription>
            </Alert>
        );
    }
    return (
        <RulebookForm stored={rulebookQuery.data} tradingPlan={tradingPlan} />
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

function LiveCard({ control }: { control: Control<RulebookFormValues> }) {
    return (
        <SectionCard title="Live sizing">
            <TextField control={control} name="live.cushionPercent.preLock" />
            <TextField control={control} name="live.cushionPercent.postLock" />
        </SectionCard>
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

function ReviewCard({ control }: { control: Control<RulebookFormValues> }) {
    return (
        <SectionCard title="Review and alerts">
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
        </SectionCard>
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
    const resetRulebook = api.propAccounts.rulebook.reset.useMutation();
    const form = useForm<RulebookFormValues>({
        defaultValues: rulebookToFormValues(stored),
        resolver: zodResolver(rulebookFormSchema, undefined, { raw: true }),
    });
    const values = useWatch({ control: form.control });
    const current = rulebookFormSchema.safeParse(values);
    const parsed = current.success ? current.data : null;
    const isSaving = upsert.isPending || resetRulebook.isPending;

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
        try {
            await resetRulebook.mutateAsync();
            form.reset(rulebookToFormValues(DEFAULT_RULEBOOK));
            toast.success('Rulebook reset to the skill defaults');
        } catch (error) {
            toast.error(errorMessage(error));
        } finally {
            await utilities.propAccounts.invalidate();
        }
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
                <EvalCard control={form.control} />
                <FundedCard control={form.control} />
                <PayoutCard control={form.control} />
                <LiveCard control={form.control} />
                <ReviewCard control={form.control} />

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
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                disabled={isSaving}
                                type="button"
                                variant="outline"
                            >
                                Reset to skill defaults
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    Reset the rulebook?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    This deletes your saved rulebook. Every
                                    value goes back to the skill defaults, so
                                    the rulebook no longer differs from the
                                    skill.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={() => {
                                        void resetToDefaults();
                                    }}
                                >
                                    Reset
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </form>
        </Form>
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

function StrategyCard({ control }: { control: Control<RulebookFormValues> }) {
    return (
        <SectionCard title="Strategy">
            <TextField control={control} name="strategy.winrate" />
            <TextField control={control} name="strategy.rr" />
            <TextField control={control} name="strategy.tradesPerDayMax" />
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
    const spec = TEXT_FIELDS[name];
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
                            {spec.hint}{' '}
                            {spec.source === null
                                ? 'Your alert threshold, not a skill rule.'
                                : `Skill: ${spec.source}, default ${spec.read(DEFAULT_FORM_VALUES)}.`}
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                );
            }}
        />
    );
}
