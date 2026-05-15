'use client';

import type { z } from 'zod';

import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
    type FieldPath,
    FormProvider,
    useForm,
    useFormContext,
} from 'react-hook-form';

import type {
    Answers,
    AssessmentResult,
    TradingPlanRow,
} from '~/lib/schemas/trading';
import type { ConfluenceKey } from '~/lib/trading-types';

import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Card, CardContent } from '~/components/ui/Card';
import { Checkbox } from '~/components/ui/Checkbox';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { Progress } from '~/components/ui/Progress';
import { RadioGroup, RadioGroupItem } from '~/components/ui/RadioGroup';
import { Slider } from '~/components/ui/Slider';
import { Switch } from '~/components/ui/Switch';
import { Textarea } from '~/components/ui/Textarea';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/ToggleGroup';
import { answersSchema } from '~/lib/schemas/trading';
import { CONFLUENCE_GROUPS } from '~/lib/trading-defaults';
import { findCurrentWindow, scoreAssessment } from '~/lib/trading-scoring';
import { cn } from '~/lib/utils';

type FormValues = z.infer<typeof answersSchema>;

const stepIds = [
    'mental',
    'context',
    'bias',
    'dol',
    'state',
    'entry',
    'sl',
    'rr',
    'finals',
] as const;
type StepId = (typeof stepIds)[number];

const stepMeta: Record<StepId, { subtitle: string; title: string }> = {
    bias: {
        subtitle:
            'Read order flow top-down. Weekly first, then daily, then drop if needed.',
        title: 'HTF → LTF bias',
    },
    context: {
        subtitle: 'Macro window, account type, and quota status.',
        title: 'Session context',
    },
    dol: {
        subtitle:
            'Where the market is going. A singular price level above or below.',
        title: 'Draw on liquidity',
    },
    entry: {
        subtitle:
            'FVG anchor + confluences. The more PD arrays stacked, the higher the grade.',
        title: 'Entry quality',
    },
    finals: {
        subtitle: 'Late-stage red flags and free-form notes for the journal.',
        title: 'Final checks',
    },
    mental: {
        subtitle:
            'Knockouts. Any flag here means stand down — execution risk outweighs setup quality.',
        title: 'Pre-flight: mental state',
    },
    rr: {
        subtitle: 'Target R after slippage vs your plan minimum.',
        title: 'Risk / reward',
    },
    sl: {
        subtitle:
            'SL must sit behind the required count of PD arrays. Otherwise: knockout.',
        title: 'Stop-loss protection',
    },
    state: {
        subtitle:
            'Recent sweeps, displacement direction, and whether the day favors reversal or continuation.',
        title: 'Market state',
    },
};

const stepFields: Record<StepId, FieldPath<FormValues>[]> = {
    bias: [
        'bias.weekly',
        'bias.daily',
        'bias.fourHour',
        'bias.oneHour',
        'bias.fifteenMin',
        'bias.conviction',
    ],
    context: [
        'context.windowId',
        'context.accountType',
        'context.windowQuotaUsed',
    ],
    dol: ['dol.type', 'dol.singular', 'dol.bothSided', 'dol.distanceR'],
    entry: ['entry.onFvg', 'entry.confluences'],
    finals: ['finals.dolAlreadyTaken', 'finals.overExtended', 'finals.notes'],
    mental: [
        'mental.hesitation',
        'mental.boredomHunt',
        'mental.revengeOrFomo',
        'mental.distracted',
    ],
    rr: ['rr.targetR', 'rr.slippageR'],
    sl: ['sl.ob', 'sl.bb', 'sl.swing'],
    state: [
        'state.opposingSweep',
        'state.displacement',
        'state.dayType',
        'state.setupType',
    ],
};

export function WizardStepper({
    onSubmit,
    plan,
}: {
    onSubmit: (answers: Answers, result: AssessmentResult) => void;
    plan: TradingPlanRow;
}) {
    const methods = useForm<FormValues>({
        defaultValues: useMemo(() => buildDefaults(plan), [plan]),
        mode: 'onChange',
        resolver: zodResolver(answersSchema),
    });
    const [stepIdx, setStepIdx] = useState(0);
    const stepId = stepIds[stepIdx] ?? stepIds[0];

    const next = async () => {
        const valid = await methods.trigger(stepFields[stepId]);
        if (!valid) return;
        if (stepIdx < stepIds.length - 1) setStepIdx((i) => i + 1);
    };

    const back = () => stepIdx > 0 && setStepIdx((i) => i - 1);

    const submit = methods.handleSubmit((values) => {
        const result = scoreAssessment(plan.config, values);
        onSubmit(values, result);
    });

    const progress = ((stepIdx + 1) / stepIds.length) * 100;

    return (
        <FormProvider {...methods}>
            <Card className={cn('app-trade-checklist__wizard')}>
                <CardContent className="flex flex-col gap-6">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span className="tracking-wider uppercase">
                                Step {stepIdx + 1} of {stepIds.length}
                            </span>
                            <Badge className="font-mono" variant="secondary">
                                {Math.round(progress)}%
                            </Badge>
                        </div>
                        <Progress value={progress} />
                    </div>

                    <div>
                        <h2 className="text-xl font-semibold text-white">
                            {stepMeta[stepId].title}
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {stepMeta[stepId].subtitle}
                        </p>
                    </div>

                    <AnimatePresence mode="wait">
                        <motion.div
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -24 }}
                            initial={{ opacity: 0, x: 24 }}
                            key={stepId}
                            transition={{ duration: 0.2 }}
                        >
                            <StepBody plan={plan} stepId={stepId} />
                        </motion.div>
                    </AnimatePresence>

                    <div
                        className={cn(
                            'app-trade-checklist__wizard-nav',
                            'flex items-center justify-between border-t border-border/50 pt-4',
                        )}
                    >
                        <Button
                            className={cn('app-trade-checklist__wizard-back')}
                            disabled={stepIdx === 0}
                            onClick={back}
                            type="button"
                            variant="outline"
                        >
                            <ArrowLeft className="mr-1 size-4" />
                            Back
                        </Button>
                        {stepIdx < stepIds.length - 1 ? (
                            <Button
                                className={cn(
                                    'app-trade-checklist__wizard-next',
                                )}
                                onClick={next}
                                type="button"
                            >
                                Next
                                <ArrowRight className="ml-1 size-4" />
                            </Button>
                        ) : (
                            <Button
                                className={cn(
                                    'app-trade-checklist__wizard-submit',
                                    'bg-emerald-500 text-emerald-50 hover:bg-emerald-500/90',
                                )}
                                onClick={submit}
                                type="button"
                            >
                                <Sparkles className="mr-1 size-4" />
                                Grade my setup
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>
        </FormProvider>
    );
}

function BiasRow({
    label,
    name,
}: {
    label: string;
    name:
        | 'bias.daily'
        | 'bias.fifteenMin'
        | 'bias.fourHour'
        | 'bias.oneHour'
        | 'bias.weekly';
}) {
    const { setValue, watch } = useFormContext<FormValues>();
    const value = watch(name);
    return (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 p-3">
            <Label className="text-sm">{label}</Label>
            <ToggleGroup
                onValueChange={(v) =>
                    v &&
                    setValue(name, v as 'bearish' | 'bullish' | 'unclear', {
                        shouldValidate: true,
                    })
                }
                type="single"
                value={value}
            >
                <ToggleGroupItem
                    className="data-[state=on]:bg-emerald-500/20 data-[state=on]:text-emerald-500"
                    value="bullish"
                >
                    Bull
                </ToggleGroupItem>
                <ToggleGroupItem
                    className="data-[state=on]:bg-rose-500/20 data-[state=on]:text-rose-500"
                    value="bearish"
                >
                    Bear
                </ToggleGroupItem>
                <ToggleGroupItem value="unclear">Unclear</ToggleGroupItem>
            </ToggleGroup>
        </div>
    );
}

function BiasStep() {
    const { setValue, watch } = useFormContext<FormValues>();
    const conviction = watch('bias.conviction');
    const weekly = watch('bias.weekly');
    const daily = watch('bias.daily');
    const fourHour = watch('bias.fourHour');
    const showLtf =
        weekly === 'unclear' && daily === 'unclear' && fourHour === 'unclear';

    return (
        <div className="flex flex-col gap-3">
            <BiasRow label="Weekly" name="bias.weekly" />
            <BiasRow label="Daily" name="bias.daily" />
            <BiasRow label="4H" name="bias.fourHour" />
            {showLtf && (
                <>
                    <BiasRow label="1H" name="bias.oneHour" />
                    <BiasRow label="15m" name="bias.fifteenMin" />
                </>
            )}
            <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-4">
                <div className="flex items-center justify-between">
                    <Label className="text-sm">Bias conviction</Label>
                    <span className="font-mono text-sm text-white">
                        {conviction}/10
                    </span>
                </div>
                <Slider
                    max={10}
                    min={1}
                    onValueChange={([v]) =>
                        setValue('bias.conviction', v ?? 5, {
                            shouldValidate: true,
                        })
                    }
                    step={1}
                    value={[conviction]}
                />
            </div>
        </div>
    );
}

function buildDefaults(plan: TradingPlanRow): FormValues {
    return {
        bias: {
            conviction: 5,
            daily: 'unclear',
            fifteenMin: 'unclear',
            fourHour: 'unclear',
            oneHour: 'unclear',
            weekly: 'unclear',
        },
        context: {
            accountType: 'funded',
            windowId: findCurrentWindow(plan.config),
            windowQuotaUsed: false,
        },
        dol: { bothSided: false, distanceR: 2, singular: false, type: 'None' },
        entry: { confluences: [], onFvg: true },
        finals: { dolAlreadyTaken: false, notes: '', overExtended: false },
        mental: {
            boredomHunt: false,
            distracted: false,
            hesitation: false,
            revengeOrFomo: false,
        },
        rr: { slippageR: 0, targetR: plan.config.setup.minRR },
        sl: { bb: false, ob: false, swing: false },
        state: {
            dayType: 'imbalanced',
            displacement: 'none',
            opposingSweep: false,
            setupType: 'continuation',
        },
    };
}

function ContextStep({ plan }: { plan: TradingPlanRow }) {
    const { setValue, watch } = useFormContext<FormValues>();
    const windowId = watch('context.windowId');
    const accountType = watch('context.accountType');
    const quotaUsed = watch('context.windowQuotaUsed');

    return (
        <div className="flex flex-col gap-5">
            <div>
                <Label className="mb-2 block text-xs tracking-wider text-muted-foreground uppercase">
                    Current macro window
                </Label>
                <ToggleGroup
                    className="flex-wrap justify-start gap-2"
                    onValueChange={(v) =>
                        setValue('context.windowId', v || null, {
                            shouldValidate: true,
                        })
                    }
                    type="single"
                    value={windowId ?? ''}
                >
                    {plan.config.windows.map((w) => (
                        <ToggleGroupItem
                            className="hover:bg-accent hover:text-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground"
                            key={w.id}
                            value={w.id}
                        >
                            <div className="text-left">
                                <div className="font-mono text-xs">
                                    {w.start}–{w.end}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                    {w.label}
                                </div>
                            </div>
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
                {!windowId && (
                    <p className="mt-2 text-xs text-rose-500">
                        Outside macro window — knockout active.
                    </p>
                )}
            </div>

            <div>
                <Label className="mb-2 block text-xs tracking-wider text-muted-foreground uppercase">
                    Account type
                </Label>
                <RadioGroup
                    className="grid grid-cols-2 gap-2"
                    onValueChange={(v) =>
                        setValue(
                            'context.accountType',
                            v as 'eval' | 'funded',
                            { shouldValidate: true },
                        )
                    }
                    value={accountType}
                >
                    {[
                        {
                            label: `Funded — $${plan.config.risk.fundedDollars}`,
                            v: 'funded',
                        },
                        {
                            label: `Eval — $${plan.config.risk.evalDollars}`,
                            v: 'eval',
                        },
                    ].map((opt) => (
                        <label
                            className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm transition ${
                                accountType === opt.v
                                    ? 'border-border bg-accent'
                                    : 'border-border/60 hover:border-border'
                            }`}
                            htmlFor={`acct-${opt.v}`}
                            key={opt.v}
                        >
                            <RadioGroupItem
                                id={`acct-${opt.v}`}
                                value={opt.v}
                            />
                            {opt.label}
                        </label>
                    ))}
                </RadioGroup>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/60 p-4">
                <div>
                    <p className="text-sm font-medium text-white">
                        Already used this window&apos;s quota?
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Plan limit: {plan.config.risk.maxTradesPerWindow}{' '}
                        trade(s) per window per account.
                    </p>
                </div>
                <Switch
                    checked={quotaUsed}
                    onCheckedChange={(v) =>
                        setValue('context.windowQuotaUsed', v, {
                            shouldValidate: true,
                        })
                    }
                />
            </div>
        </div>
    );
}

function DolStep({ plan }: { plan: TradingPlanRow }) {
    const { setValue, watch } = useFormContext<FormValues>();
    const type = watch('dol.type');
    const singular = watch('dol.singular');
    const bothSided = watch('dol.bothSided');
    const distanceR = watch('dol.distanceR');

    return (
        <div className="flex flex-col gap-4">
            <div>
                <Label className="mb-2 block text-xs tracking-wider text-muted-foreground uppercase">
                    DOL type
                </Label>
                <ToggleGroup
                    className="flex-wrap justify-start gap-2"
                    onValueChange={(v) =>
                        v &&
                        setValue('dol.type', v as typeof type, {
                            shouldValidate: true,
                        })
                    }
                    type="single"
                    value={type}
                >
                    {plan.config.setup.allowedDolTypes.map((t) => (
                        <ToggleGroupItem
                            className="data-[state=on]:bg-emerald-500/20 data-[state=on]:text-emerald-500"
                            key={t}
                            value={t}
                        >
                            {t}
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/60 p-4">
                <span className="text-sm text-white">
                    Singular and clearly defined DOL
                </span>
                <Switch
                    checked={singular}
                    onCheckedChange={(v) =>
                        setValue('dol.singular', v, {
                            shouldValidate: true,
                        })
                    }
                />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/5 p-4">
                <div>
                    <p className="text-sm text-white">Both-sided liquidity?</p>
                    <p className="mt-0.5 text-xs text-rose-500">
                        Knockout if on — sit out until one side is taken.
                    </p>
                </div>
                <Switch
                    checked={bothSided}
                    onCheckedChange={(v) =>
                        setValue('dol.bothSided', v, {
                            shouldValidate: true,
                        })
                    }
                />
            </div>

            <div className="rounded-lg border border-border/60 p-4">
                <Label className="text-sm" htmlFor="distanceR">
                    Distance to DOL (in R)
                </Label>
                <Input
                    className="mt-2 text-white"
                    id="distanceR"
                    onChange={(e) =>
                        setValue('dol.distanceR', e.target.valueAsNumber, {
                            shouldValidate: true,
                        })
                    }
                    step="0.1"
                    type="number"
                    value={Number.isNaN(distanceR) ? '' : distanceR}
                />
            </div>
        </div>
    );
}

function EntryStep({ plan }: { plan: TradingPlanRow }) {
    const { setValue, watch } = useFormContext<FormValues>();
    const confluences = watch('entry.confluences');

    const toggle = (k: ConfluenceKey) => {
        const next = confluences.includes(k)
            ? confluences.filter((c) => c !== k)
            : [...confluences, k];
        setValue('entry.confluences', next, { shouldValidate: true });
    };

    return (
        <div className="flex flex-col gap-5">
            {CONFLUENCE_GROUPS.map((group) => {
                const items = group.items.filter((c) =>
                    plan.config.setup.allowedConfluences.includes(c),
                );
                if (items.length === 0) return null;
                const groupSelected = items.filter((c) =>
                    confluences.includes(c),
                );
                return (
                    <div className="flex flex-col gap-2" key={group.label}>
                        <div className="flex items-center justify-between gap-2">
                            <Label className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tracking-wider text-muted-foreground uppercase">
                                {group.label}
                                <Badge variant="secondary">
                                    {groupSelected.length} selected
                                </Badge>
                            </Label>
                            <div className="flex items-center gap-2">
                                <Button
                                    onClick={() =>
                                        setValue(
                                            'entry.confluences',
                                            confluences.filter(
                                                (c) =>
                                                    !items.includes(
                                                        c as ConfluenceKey,
                                                    ),
                                            ),
                                            { shouldValidate: true },
                                        )
                                    }
                                    size="sm"
                                    type="button"
                                    variant="outline"
                                >
                                    Clear
                                </Button>
                                <Button
                                    onClick={() => {
                                        const rest = confluences.filter(
                                            (c) =>
                                                !items.includes(
                                                    c as ConfluenceKey,
                                                ),
                                        );
                                        setValue(
                                            'entry.confluences',
                                            [...rest, ...items],
                                            { shouldValidate: true },
                                        );
                                    }}
                                    size="sm"
                                    type="button"
                                    variant="outline"
                                >
                                    All
                                </Button>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {items.map((c) => (
                                <label
                                    className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 p-2 text-sm transition hover:border-border"
                                    key={c}
                                >
                                    <Checkbox
                                        checked={confluences.includes(c)}
                                        onCheckedChange={() => toggle(c)}
                                    />
                                    {c}
                                </label>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function FinalsStep() {
    const { register, setValue, watch } = useFormContext<FormValues>();
    const dolTaken = watch('finals.dolAlreadyTaken');
    const overExtended = watch('finals.overExtended');

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/5 p-4">
                <div>
                    <p className="text-sm text-white">
                        DOL already taken or invalidated
                    </p>
                    <p className="mt-0.5 text-xs text-rose-500">
                        Knockout. If yes, the trade is invalid.
                    </p>
                </div>
                <Switch
                    checked={dolTaken}
                    onCheckedChange={(v) =>
                        setValue('finals.dolAlreadyTaken', v, {
                            shouldValidate: true,
                        })
                    }
                />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 p-4">
                <div>
                    <p className="text-sm text-white">
                        Market already expanded too far
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Soft flag — late entries get penalized in scoring.
                    </p>
                </div>
                <Switch
                    checked={overExtended}
                    onCheckedChange={(v) =>
                        setValue('finals.overExtended', v, {
                            shouldValidate: true,
                        })
                    }
                />
            </div>
            <div className="rounded-lg border border-border/60 p-4">
                <Label className="text-sm" htmlFor="notes">
                    Notes
                </Label>
                <Textarea
                    id="notes"
                    placeholder="Free-form context for the journal."
                    rows={4}
                    {...register('finals.notes')}
                    className="mt-2"
                />
            </div>
        </div>
    );
}

function MentalStep() {
    const { setValue, watch } = useFormContext<FormValues>();
    const rows: {
        name: keyof FormValues['mental'];
        rule: string;
        title: string;
    }[] = [
        {
            name: 'hesitation',
            rule: 'If technicals are met — execute. Don’t wait for extra confirmation from fear.',
            title: 'Am I scared but the setup is valid?',
        },
        {
            name: 'boredomHunt',
            rule: 'If you hop timeframes hunting setups, it isn’t there. Walk away.',
            title: 'Am I inventing a trade because I want to trade?',
        },
        {
            name: 'revengeOrFomo',
            rule: 'Don’t chase fills or force trades to recoup. Wait for the next clean session.',
            title: 'Just missed a trade or took a loss?',
        },
        {
            name: 'distracted',
            rule: 'If full focus isn’t possible — do not trade.',
            title: 'Distracted by anything?',
        },
    ];

    return (
        <div className="flex flex-col gap-3">
            {rows.map((r) => {
                const checked = watch(`mental.${r.name}`);
                return (
                    <label
                        className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 bg-card p-4 transition hover:border-border"
                        key={r.name}
                    >
                        <Switch
                            checked={checked}
                            className="mt-0.5"
                            onCheckedChange={(v) =>
                                setValue(`mental.${r.name}`, v, {
                                    shouldValidate: true,
                                })
                            }
                        />
                        <div className="flex-1">
                            <p className="text-sm font-medium text-white">
                                {r.title}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {r.rule}
                            </p>
                        </div>
                        {checked && <Badge variant="destructive">flag</Badge>}
                    </label>
                );
            })}
        </div>
    );
}

function RrStep({ plan }: { plan: TradingPlanRow }) {
    const { setValue, watch } = useFormContext<FormValues>();
    const accountType = watch('context.accountType');
    const targetR = watch('rr.targetR');
    const slippageR = watch('rr.slippageR');
    const dollars =
        accountType === 'funded'
            ? plan.config.risk.fundedDollars
            : plan.config.risk.evalDollars;
    const expected = Math.max(0, targetR - slippageR);

    return (
        <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-border/60 p-4">
                <p className="text-xs tracking-wider text-muted-foreground uppercase">
                    Risk this trade
                </p>
                <p className="mt-1 font-mono text-2xl text-white">
                    ${dollars.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                    Based on {accountType === 'funded' ? 'funded' : 'eval'}{' '}
                    account selection.
                </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border/60 p-4">
                    <Label className="text-sm" htmlFor="targetR">
                        Target R
                    </Label>
                    <Input
                        className="mt-2 text-white"
                        id="targetR"
                        onChange={(e) =>
                            setValue('rr.targetR', e.target.valueAsNumber, {
                                shouldValidate: true,
                            })
                        }
                        step="0.1"
                        type="number"
                        value={Number.isNaN(targetR) ? '' : targetR}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                        Plan minimum: {plan.config.setup.minRR}R
                    </p>
                </div>
                <div className="rounded-lg border border-border/60 p-4">
                    <Label className="text-sm" htmlFor="slippageR">
                        Expected slippage (R)
                    </Label>
                    <Input
                        className="mt-2 text-white"
                        id="slippageR"
                        onChange={(e) =>
                            setValue('rr.slippageR', e.target.valueAsNumber, {
                                shouldValidate: true,
                            })
                        }
                        step="0.05"
                        type="number"
                        value={Number.isNaN(slippageR) ? '' : slippageR}
                    />
                </div>
            </div>
            <div
                className={`rounded-md border p-3 text-sm font-medium ${
                    expected >= plan.config.setup.minRR
                        ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-500'
                        : 'border-rose-500/40 bg-rose-500/5 text-rose-500'
                }`}
            >
                Expected net: {expected.toFixed(2)}R{' '}
                {expected >= plan.config.setup.minRR
                    ? '— meets minimum'
                    : `— below plan minimum of ${plan.config.setup.minRR}R`}
            </div>
        </div>
    );
}

function SlStep({ plan }: { plan: TradingPlanRow }) {
    const { setValue, watch } = useFormContext<FormValues>();
    const ob = watch('sl.ob');
    const bb = watch('sl.bb');
    const swing = watch('sl.swing');
    const count = (ob ? 1 : 0) + (bb ? 1 : 0) + (swing ? 1 : 0);
    const required = plan.config.setup.requiredPdArrays;
    const ok = count >= required;

    const rows: {
        hint: string;
        label: string;
        name: keyof FormValues['sl'];
    }[] = [
        {
            hint: 'SL sits behind a clear OB structure.',
            label: 'Stop paired with Order Block',
            name: 'ob',
        },
        {
            hint: 'SL sits behind a clear BB structure.',
            label: 'Stop paired with Breaker Block',
            name: 'bb',
        },
        {
            hint: 'SL is at a defined swing high/low, not a random level.',
            label: 'Stop at clear swing point',
            name: 'swing',
        },
    ];

    return (
        <div className="flex flex-col gap-3">
            {rows.map((r) => {
                const v = watch(`sl.${r.name}`);
                return (
                    <div
                        className="flex items-center justify-between rounded-lg border border-border/60 p-4"
                        key={r.name}
                    >
                        <div className="flex items-start gap-3">
                            <Checkbox
                                checked={v}
                                className="mt-0.5"
                                onCheckedChange={(x) =>
                                    setValue(`sl.${r.name}`, Boolean(x), {
                                        shouldValidate: true,
                                    })
                                }
                            />
                            <div>
                                <p className="text-sm font-medium text-white">
                                    {r.label}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    {r.hint}
                                </p>
                            </div>
                        </div>
                    </div>
                );
            })}
            <div
                className={`rounded-md border p-3 text-sm font-medium ${
                    ok
                        ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-500'
                        : 'border-rose-500/40 bg-rose-500/5 text-rose-500'
                }`}
            >
                {count}/{required} PD arrays protecting the stop
                {!ok && ' — knockout active'}
            </div>
        </div>
    );
}

function StateStep() {
    const { setValue, watch } = useFormContext<FormValues>();
    const sweep = watch('state.opposingSweep');
    const displacement = watch('state.displacement');
    const dayType = watch('state.dayType');
    const setupType = watch('state.setupType');

    const coherent =
        (dayType === 'balanced' && setupType === 'reversal') ||
        (dayType === 'imbalanced' && setupType === 'continuation');

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between rounded-lg border border-border/60 p-4">
                <div>
                    <p className="text-sm font-medium text-white">
                        Recent sweep of opposing liquidity
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Did price recently take stops in the opposite direction?
                    </p>
                </div>
                <Switch
                    checked={sweep}
                    onCheckedChange={(v) =>
                        setValue('state.opposingSweep', v, {
                            shouldValidate: true,
                        })
                    }
                />
            </div>

            <div>
                <Label className="mb-2 block text-xs tracking-wider text-muted-foreground uppercase">
                    Recent displacement direction
                </Label>
                <ToggleGroup
                    className="justify-start gap-2"
                    onValueChange={(v) =>
                        v &&
                        setValue(
                            'state.displacement',
                            v as 'away' | 'none' | 'toward',
                            { shouldValidate: true },
                        )
                    }
                    type="single"
                    value={displacement}
                >
                    <ToggleGroupItem
                        className="data-[state=on]:bg-emerald-500/20 data-[state=on]:text-emerald-500"
                        value="toward"
                    >
                        Toward DOL
                    </ToggleGroupItem>
                    <ToggleGroupItem
                        className="data-[state=on]:bg-rose-500/20 data-[state=on]:text-rose-500"
                        value="away"
                    >
                        Away
                    </ToggleGroupItem>
                    <ToggleGroupItem value="none">None yet</ToggleGroupItem>
                </ToggleGroup>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <Label className="mb-2 block text-xs tracking-wider text-muted-foreground uppercase">
                        Day type
                    </Label>
                    <RadioGroup
                        className="flex flex-col gap-1"
                        onValueChange={(v) =>
                            setValue(
                                'state.dayType',
                                v as 'balanced' | 'imbalanced',
                                { shouldValidate: true },
                            )
                        }
                        value={dayType}
                    >
                        {[
                            { label: 'Balanced', v: 'balanced' },
                            { label: 'Imbalanced', v: 'imbalanced' },
                        ].map((opt) => (
                            <label
                                className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 p-2 text-sm"
                                htmlFor={`day-${opt.v}`}
                                key={opt.v}
                            >
                                <RadioGroupItem
                                    id={`day-${opt.v}`}
                                    value={opt.v}
                                />
                                {opt.label}
                            </label>
                        ))}
                    </RadioGroup>
                </div>

                <div>
                    <Label className="mb-2 block text-xs tracking-wider text-muted-foreground uppercase">
                        Setup type
                    </Label>
                    <RadioGroup
                        className="flex flex-col gap-1"
                        onValueChange={(v) =>
                            setValue(
                                'state.setupType',
                                v as 'continuation' | 'reversal',
                                { shouldValidate: true },
                            )
                        }
                        value={setupType}
                    >
                        {[
                            {
                                label: 'Reversal at range extreme',
                                v: 'reversal',
                            },
                            {
                                label: 'Continuation toward HTF',
                                v: 'continuation',
                            },
                        ].map((opt) => (
                            <label
                                className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 p-2 text-sm"
                                htmlFor={`setup-${opt.v}`}
                                key={opt.v}
                            >
                                <RadioGroupItem
                                    id={`setup-${opt.v}`}
                                    value={opt.v}
                                />
                                {opt.label}
                            </label>
                        ))}
                    </RadioGroup>
                </div>
            </div>

            <div
                className={`rounded-md border p-3 text-xs ${
                    coherent
                        ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-500'
                        : 'border-amber-500/40 bg-amber-500/5 text-amber-500'
                }`}
            >
                {coherent
                    ? 'Day type and setup type form a coherent narrative.'
                    : 'Mismatch: balanced days favor reversal, imbalanced days favor continuation.'}
            </div>
        </div>
    );
}

function StepBody({ plan, stepId }: { plan: TradingPlanRow; stepId: StepId }) {
    switch (stepId) {
        case 'bias': {
            return <BiasStep />;
        }
        case 'context': {
            return <ContextStep plan={plan} />;
        }
        case 'dol': {
            return <DolStep plan={plan} />;
        }
        case 'entry': {
            return <EntryStep plan={plan} />;
        }
        case 'finals': {
            return <FinalsStep />;
        }
        case 'mental': {
            return <MentalStep />;
        }
        case 'rr': {
            return <RrStep plan={plan} />;
        }
        case 'sl': {
            return <SlStep plan={plan} />;
        }
        case 'state': {
            return <StateStep />;
        }
    }
}
