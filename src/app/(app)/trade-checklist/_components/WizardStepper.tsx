'use client';

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
import { z } from 'zod';

import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Card, CardContent } from '~/components/ui/Card';
import { Checkbox } from '~/components/ui/Checkbox';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { Progress } from '~/components/ui/Progress';
import { RadioGroup, RadioGroupItem } from '~/components/ui/Radio-group';
import { Slider } from '~/components/ui/Slider';
import { Switch } from '~/components/ui/Switch';
import { Textarea } from '~/components/ui/Textarea';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/Toggle-group';
import { CONFLUENCE_GROUPS, DEFAULT_DOL_TYPES } from '~/lib/trading-defaults';
import { findCurrentWindow, scoreAssessment } from '~/lib/trading-scoring';
import { DOL_TYPE_VALUES } from '~/lib/trading-types';
import type {
    Answers,
    AssessmentResult,
    ConfluenceKey,
    TradingPlanRow,
} from '~/lib/trading-types';

const biasEnum = z.enum(['bullish', 'bearish', 'unclear']);
const accountEnum = z.enum(['funded', 'eval']);
const dolEnum = z.enum(DOL_TYPE_VALUES);
const dayEnum = z.enum(['balanced', 'imbalanced']);
const setupEnum = z.enum(['reversal', 'continuation']);
const displacementEnum = z.enum(['toward', 'away', 'none']);

const answersSchema = z.object({
    mental: z.object({
        hesitation: z.boolean(),
        boredomHunt: z.boolean(),
        revengeOrFomo: z.boolean(),
        distracted: z.boolean(),
    }),
    context: z.object({
        windowId: z.string().nullable(),
        accountType: accountEnum,
        windowQuotaUsed: z.boolean(),
    }),
    bias: z.object({
        weekly: biasEnum,
        daily: biasEnum,
        fourHour: biasEnum,
        oneHour: biasEnum,
        fifteenMin: biasEnum,
        conviction: z.number().min(1).max(10),
    }),
    dol: z.object({
        type: dolEnum,
        singular: z.boolean(),
        bothSided: z.boolean(),
        distanceR: z.number().min(0),
    }),
    state: z.object({
        opposingSweep: z.boolean(),
        displacement: displacementEnum,
        dayType: dayEnum,
        setupType: setupEnum,
    }),
    entry: z.object({
        onFvg: z.boolean(),
        confluences: z.array(z.string()),
    }),
    sl: z.object({
        ob: z.boolean(),
        bb: z.boolean(),
        swing: z.boolean(),
    }),
    rr: z.object({
        targetR: z.number().min(0),
        slippageR: z.number().min(0),
    }),
    finals: z.object({
        dolAlreadyTaken: z.boolean(),
        overExtended: z.boolean(),
        notes: z.string(),
    }),
});

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

const stepMeta: Record<StepId, { title: string; subtitle: string }> = {
    mental: {
        title: 'Pre-flight: mental state',
        subtitle:
            'Knockouts. Any flag here means stand down — execution risk outweighs setup quality.',
    },
    context: {
        title: 'Session context',
        subtitle: 'Macro window, account type, and quota status.',
    },
    bias: {
        title: 'HTF → LTF bias',
        subtitle:
            'Read order flow top-down. Weekly first, then daily, then drop if needed.',
    },
    dol: {
        title: 'Draw on liquidity',
        subtitle:
            'Where the market is going. A singular price level above or below.',
    },
    state: {
        title: 'Market state',
        subtitle:
            'Recent sweeps, displacement direction, and whether the day favors reversal or continuation.',
    },
    entry: {
        title: 'Entry quality',
        subtitle:
            'FVG anchor + confluences. The more PD arrays stacked, the higher the grade.',
    },
    sl: {
        title: 'Stop-loss protection',
        subtitle:
            'SL must sit behind the required count of PD arrays. Otherwise: knockout.',
    },
    rr: {
        title: 'Risk / reward',
        subtitle: 'Target R after slippage vs your plan minimum.',
    },
    finals: {
        title: 'Final checks',
        subtitle: 'Late-stage red flags and free-form notes for the journal.',
    },
};

const stepFields: Record<StepId, FieldPath<FormValues>[]> = {
    mental: [
        'mental.hesitation',
        'mental.boredomHunt',
        'mental.revengeOrFomo',
        'mental.distracted',
    ],
    context: [
        'context.windowId',
        'context.accountType',
        'context.windowQuotaUsed',
    ],
    bias: [
        'bias.weekly',
        'bias.daily',
        'bias.fourHour',
        'bias.oneHour',
        'bias.fifteenMin',
        'bias.conviction',
    ],
    dol: ['dol.type', 'dol.singular', 'dol.bothSided', 'dol.distanceR'],
    state: [
        'state.opposingSweep',
        'state.displacement',
        'state.dayType',
        'state.setupType',
    ],
    entry: ['entry.onFvg', 'entry.confluences'],
    sl: ['sl.ob', 'sl.bb', 'sl.swing'],
    rr: ['rr.targetR', 'rr.slippageR'],
    finals: ['finals.dolAlreadyTaken', 'finals.overExtended', 'finals.notes'],
};

function buildDefaults(plan: TradingPlanRow): FormValues {
    return {
        mental: {
            hesitation: false,
            boredomHunt: false,
            revengeOrFomo: false,
            distracted: false,
        },
        context: {
            windowId: findCurrentWindow(plan.config),
            accountType: 'funded',
            windowQuotaUsed: false,
        },
        bias: {
            weekly: 'unclear',
            daily: 'unclear',
            fourHour: 'unclear',
            oneHour: 'unclear',
            fifteenMin: 'unclear',
            conviction: 5,
        },
        dol: { type: 'None', singular: false, bothSided: false, distanceR: 2 },
        state: {
            opposingSweep: false,
            displacement: 'none',
            dayType: 'imbalanced',
            setupType: 'continuation',
        },
        entry: { onFvg: true, confluences: [] },
        sl: { ob: false, bb: false, swing: false },
        rr: { targetR: plan.config.setup.minRR, slippageR: 0 },
        finals: { dolAlreadyTaken: false, overExtended: false, notes: '' },
    };
}

export function WizardStepper({
    plan,
    onSubmit,
}: {
    plan: TradingPlanRow;
    onSubmit: (answers: Answers, result: AssessmentResult) => void;
}) {
    const methods = useForm<FormValues>({
        resolver: zodResolver(answersSchema),
        defaultValues: useMemo(() => buildDefaults(plan), [plan]),
        mode: 'onChange',
    });
    const [stepIdx, setStepIdx] = useState(0);
    const stepId = stepIds[stepIdx]!;

    const next = async () => {
        const valid = await methods.trigger(stepFields[stepId]);
        if (!valid) return;
        if (stepIdx < stepIds.length - 1) setStepIdx((i) => i + 1);
    };

    const back = () => stepIdx > 0 && setStepIdx((i) => i - 1);

    const submit = methods.handleSubmit((values) => {
        const result = scoreAssessment(plan.config, values as Answers);
        onSubmit(values as Answers, result);
    });

    const progress = ((stepIdx + 1) / stepIds.length) * 100;

    return (
        <FormProvider {...methods}>
            <Card>
                <CardContent className="space-y-6">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span className="tracking-wider uppercase">
                                Step {stepIdx + 1} of {stepIds.length}
                            </span>
                            <Badge variant="secondary" className="font-mono">
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
                            key={stepId}
                            initial={{ opacity: 0, x: 24 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -24 }}
                            transition={{ duration: 0.2 }}
                        >
                            <StepBody plan={plan} stepId={stepId} />
                        </motion.div>
                    </AnimatePresence>

                    <div className="flex items-center justify-between border-t border-border/50 pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={back}
                            disabled={stepIdx === 0}
                        >
                            <ArrowLeft className="mr-1 size-4" />
                            Back
                        </Button>
                        {stepIdx < stepIds.length - 1 ? (
                            <Button type="button" onClick={next}>
                                Next
                                <ArrowRight className="ml-1 size-4" />
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                onClick={submit}
                                className="bg-emerald-500 text-emerald-50 hover:bg-emerald-500/90"
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

function StepBody({ plan, stepId }: { plan: TradingPlanRow; stepId: StepId }) {
    switch (stepId) {
        case 'mental':
            return <MentalStep />;
        case 'context':
            return <ContextStep plan={plan} />;
        case 'bias':
            return <BiasStep />;
        case 'dol':
            return <DolStep plan={plan} />;
        case 'state':
            return <StateStep />;
        case 'entry':
            return <EntryStep plan={plan} />;
        case 'sl':
            return <SlStep plan={plan} />;
        case 'rr':
            return <RrStep plan={plan} />;
        case 'finals':
            return <FinalsStep />;
    }
}

function MentalStep() {
    const { watch, setValue } = useFormContext<FormValues>();
    const rows: {
        name: keyof FormValues['mental'];
        title: string;
        rule: string;
    }[] = [
        {
            name: 'hesitation',
            title: 'Am I scared but the setup is valid?',
            rule: 'If technicals are met — execute. Don’t wait for extra confirmation from fear.',
        },
        {
            name: 'boredomHunt',
            title: 'Am I inventing a trade because I want to trade?',
            rule: 'If you hop timeframes hunting setups, it isn’t there. Walk away.',
        },
        {
            name: 'revengeOrFomo',
            title: 'Just missed a trade or took a loss?',
            rule: 'Don’t chase fills or force trades to recoup. Wait for the next clean session.',
        },
        {
            name: 'distracted',
            title: 'Distracted by anything?',
            rule: 'If full focus isn’t possible — do not trade.',
        },
    ];

    return (
        <div className="space-y-3">
            {rows.map((r) => {
                const checked = watch(`mental.${r.name}`);
                return (
                    <label
                        key={r.name}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 bg-card p-4 transition hover:border-border"
                    >
                        <Switch
                            checked={checked}
                            onCheckedChange={(v) =>
                                setValue(`mental.${r.name}`, Boolean(v), {
                                    shouldValidate: true,
                                })
                            }
                            className="mt-0.5"
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

function ContextStep({ plan }: { plan: TradingPlanRow }) {
    const { watch, setValue } = useFormContext<FormValues>();
    const windowId = watch('context.windowId');
    const accountType = watch('context.accountType');
    const quotaUsed = watch('context.windowQuotaUsed');

    return (
        <div className="space-y-5">
            <div>
                <Label className="mb-2 block text-xs tracking-wider text-muted-foreground uppercase">
                    Current macro window
                </Label>
                <ToggleGroup
                    type="single"
                    value={windowId ?? ''}
                    onValueChange={(v) =>
                        setValue('context.windowId', v || null, {
                            shouldValidate: true,
                        })
                    }
                    className="flex-wrap justify-start gap-2"
                >
                    {plan.config.windows.map((w) => (
                        <ToggleGroupItem
                            key={w.id}
                            value={w.id}
                            className="hover:bg-accent hover:text-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground"
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
                    value={accountType}
                    onValueChange={(v) =>
                        setValue(
                            'context.accountType',
                            v as 'funded' | 'eval',
                            { shouldValidate: true },
                        )
                    }
                    className="grid grid-cols-2 gap-2"
                >
                    {[
                        {
                            v: 'funded',
                            label: `Funded — $${plan.config.risk.fundedDollars}`,
                        },
                        {
                            v: 'eval',
                            label: `Eval — $${plan.config.risk.evalDollars}`,
                        },
                    ].map((opt) => (
                        <label
                            key={opt.v}
                            htmlFor={`acct-${opt.v}`}
                            className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm transition ${
                                accountType === opt.v
                                    ? 'border-border bg-accent'
                                    : 'border-border/60 hover:border-border'
                            }`}
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

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/60 p-4">
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
                        setValue('context.windowQuotaUsed', Boolean(v), {
                            shouldValidate: true,
                        })
                    }
                />
            </label>
        </div>
    );
}

function BiasRow({
    name,
    label,
}: {
    name:
        | 'bias.weekly'
        | 'bias.daily'
        | 'bias.fourHour'
        | 'bias.oneHour'
        | 'bias.fifteenMin';
    label: string;
}) {
    const { watch, setValue } = useFormContext<FormValues>();
    const value = watch(name);
    return (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 p-3">
            <Label className="text-sm">{label}</Label>
            <ToggleGroup
                type="single"
                value={value}
                onValueChange={(v) =>
                    v &&
                    setValue(name, v as 'bullish' | 'bearish' | 'unclear', {
                        shouldValidate: true,
                    })
                }
            >
                <ToggleGroupItem
                    value="bullish"
                    className="data-[state=on]:bg-emerald-500/20 data-[state=on]:text-emerald-500"
                >
                    Bull
                </ToggleGroupItem>
                <ToggleGroupItem
                    value="bearish"
                    className="data-[state=on]:bg-rose-500/20 data-[state=on]:text-rose-500"
                >
                    Bear
                </ToggleGroupItem>
                <ToggleGroupItem value="unclear">Unclear</ToggleGroupItem>
            </ToggleGroup>
        </div>
    );
}

function BiasStep() {
    const { watch, setValue } = useFormContext<FormValues>();
    const conviction = watch('bias.conviction');
    const weekly = watch('bias.weekly');
    const daily = watch('bias.daily');
    const fourHour = watch('bias.fourHour');
    const showLtf =
        weekly === 'unclear' && daily === 'unclear' && fourHour === 'unclear';

    return (
        <div className="space-y-3">
            <BiasRow name="bias.weekly" label="Weekly" />
            <BiasRow name="bias.daily" label="Daily" />
            <BiasRow name="bias.fourHour" label="4H" />
            {showLtf && (
                <>
                    <BiasRow name="bias.oneHour" label="1H" />
                    <BiasRow name="bias.fifteenMin" label="15m" />
                </>
            )}
            <div className="space-y-2 rounded-lg border border-border/60 p-4">
                <div className="flex items-center justify-between">
                    <Label className="text-sm">Bias conviction</Label>
                    <span className="font-mono text-sm text-white">
                        {conviction}/10
                    </span>
                </div>
                <Slider
                    value={[conviction]}
                    min={1}
                    max={10}
                    step={1}
                    onValueChange={([v]) =>
                        setValue('bias.conviction', v ?? 5, {
                            shouldValidate: true,
                        })
                    }
                />
            </div>
        </div>
    );
}

function DolStep({ plan }: { plan: TradingPlanRow }) {
    const { watch, setValue } = useFormContext<FormValues>();
    const type = watch('dol.type');
    const singular = watch('dol.singular');
    const bothSided = watch('dol.bothSided');
    const distanceR = watch('dol.distanceR');

    return (
        <div className="space-y-4">
            <div>
                <Label className="mb-2 block text-xs tracking-wider text-muted-foreground uppercase">
                    DOL type
                </Label>
                <ToggleGroup
                    type="single"
                    value={type}
                    onValueChange={(v) =>
                        v &&
                        setValue('dol.type', v as typeof type, {
                            shouldValidate: true,
                        })
                    }
                    className="flex-wrap justify-start gap-2"
                >
                    {(
                        plan.config.setup.allowedDolTypes ?? DEFAULT_DOL_TYPES
                    ).map((t) => (
                        <ToggleGroupItem
                            key={t}
                            value={t}
                            className="data-[state=on]:bg-emerald-500/20 data-[state=on]:text-emerald-500"
                        >
                            {t}
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
            </div>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/60 p-4">
                <span className="text-sm text-white">
                    Singular and clearly defined DOL
                </span>
                <Switch
                    checked={singular}
                    onCheckedChange={(v) =>
                        setValue('dol.singular', Boolean(v), {
                            shouldValidate: true,
                        })
                    }
                />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/5 p-4">
                <div>
                    <p className="text-sm text-white">Both-sided liquidity?</p>
                    <p className="mt-0.5 text-xs text-rose-500">
                        Knockout if on — sit out until one side is taken.
                    </p>
                </div>
                <Switch
                    checked={bothSided}
                    onCheckedChange={(v) =>
                        setValue('dol.bothSided', Boolean(v), {
                            shouldValidate: true,
                        })
                    }
                />
            </label>

            <div className="rounded-lg border border-border/60 p-4">
                <Label htmlFor="distanceR" className="text-sm">
                    Distance to DOL (in R)
                </Label>
                <Input
                    id="distanceR"
                    type="number"
                    step="0.1"
                    value={Number.isNaN(distanceR) ? '' : distanceR}
                    onChange={(e) =>
                        setValue('dol.distanceR', e.target.valueAsNumber, {
                            shouldValidate: true,
                        })
                    }
                    className="mt-2 text-white"
                />
            </div>
        </div>
    );
}

function StateStep() {
    const { watch, setValue } = useFormContext<FormValues>();
    const sweep = watch('state.opposingSweep');
    const displacement = watch('state.displacement');
    const dayType = watch('state.dayType');
    const setupType = watch('state.setupType');

    const coherent =
        (dayType === 'balanced' && setupType === 'reversal') ||
        (dayType === 'imbalanced' && setupType === 'continuation');

    return (
        <div className="space-y-4">
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/60 p-4">
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
                        setValue('state.opposingSweep', Boolean(v), {
                            shouldValidate: true,
                        })
                    }
                />
            </label>

            <div>
                <Label className="mb-2 block text-xs tracking-wider text-muted-foreground uppercase">
                    Recent displacement direction
                </Label>
                <ToggleGroup
                    type="single"
                    value={displacement}
                    onValueChange={(v) =>
                        v &&
                        setValue(
                            'state.displacement',
                            v as 'toward' | 'away' | 'none',
                            { shouldValidate: true },
                        )
                    }
                    className="justify-start gap-2"
                >
                    <ToggleGroupItem
                        value="toward"
                        className="data-[state=on]:bg-emerald-500/20 data-[state=on]:text-emerald-500"
                    >
                        Toward DOL
                    </ToggleGroupItem>
                    <ToggleGroupItem
                        value="away"
                        className="data-[state=on]:bg-rose-500/20 data-[state=on]:text-rose-500"
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
                        value={dayType}
                        onValueChange={(v) =>
                            setValue(
                                'state.dayType',
                                v as 'balanced' | 'imbalanced',
                                { shouldValidate: true },
                            )
                        }
                        className="space-y-1"
                    >
                        {[
                            { v: 'balanced', label: 'Balanced' },
                            { v: 'imbalanced', label: 'Imbalanced' },
                        ].map((opt) => (
                            <label
                                key={opt.v}
                                htmlFor={`day-${opt.v}`}
                                className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 p-2 text-sm"
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
                        value={setupType}
                        onValueChange={(v) =>
                            setValue(
                                'state.setupType',
                                v as 'reversal' | 'continuation',
                                { shouldValidate: true },
                            )
                        }
                        className="space-y-1"
                    >
                        {[
                            {
                                v: 'reversal',
                                label: 'Reversal at range extreme',
                            },
                            {
                                v: 'continuation',
                                label: 'Continuation toward HTF',
                            },
                        ].map((opt) => (
                            <label
                                key={opt.v}
                                htmlFor={`setup-${opt.v}`}
                                className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 p-2 text-sm"
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

function EntryStep({ plan }: { plan: TradingPlanRow }) {
    const { watch, setValue } = useFormContext<FormValues>();
    const confluences = watch('entry.confluences');

    const toggle = (k: ConfluenceKey) => {
        const next = confluences.includes(k)
            ? confluences.filter((c) => c !== k)
            : [...confluences, k];
        setValue('entry.confluences', next, { shouldValidate: true });
    };

    return (
        <div className="space-y-5">
            {CONFLUENCE_GROUPS.map((group) => {
                const items = group.items.filter((c) =>
                    plan.config.setup.allowedConfluences.includes(c),
                );
                if (items.length === 0) return null;
                const groupSelected = items.filter((c) =>
                    confluences.includes(c),
                );
                return (
                    <div key={group.label} className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <Label className="text-xs tracking-wider text-muted-foreground uppercase">
                                {group.label}
                                <Badge variant="secondary" className="ml-2">
                                    {groupSelected.length} selected
                                </Badge>
                            </Label>
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
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
                                >
                                    Clear
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
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
                                >
                                    All
                                </Button>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {items.map((c) => (
                                <label
                                    key={c}
                                    className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 p-2 text-sm transition hover:border-border"
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

function SlStep({ plan }: { plan: TradingPlanRow }) {
    const { watch, setValue } = useFormContext<FormValues>();
    const ob = watch('sl.ob');
    const bb = watch('sl.bb');
    const swing = watch('sl.swing');
    const count = (ob ? 1 : 0) + (bb ? 1 : 0) + (swing ? 1 : 0);
    const required = plan.config.setup.requiredPdArrays;
    const ok = count >= required;

    const rows: {
        name: keyof FormValues['sl'];
        label: string;
        hint: string;
    }[] = [
        {
            name: 'ob',
            label: 'Stop paired with Order Block',
            hint: 'SL sits behind a clear OB structure.',
        },
        {
            name: 'bb',
            label: 'Stop paired with Breaker Block',
            hint: 'SL sits behind a clear BB structure.',
        },
        {
            name: 'swing',
            label: 'Stop at clear swing point',
            hint: 'SL is at a defined swing high/low, not a random level.',
        },
    ];

    return (
        <div className="space-y-3">
            {rows.map((r) => {
                const v = watch(`sl.${r.name}`);
                return (
                    <label
                        key={r.name}
                        className="flex cursor-pointer items-center justify-between rounded-lg border border-border/60 p-4"
                    >
                        <div className="flex items-start gap-3">
                            <Checkbox
                                checked={v}
                                onCheckedChange={(x) =>
                                    setValue(`sl.${r.name}`, Boolean(x), {
                                        shouldValidate: true,
                                    })
                                }
                                className="mt-0.5"
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
                    </label>
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

function RrStep({ plan }: { plan: TradingPlanRow }) {
    const { watch, setValue } = useFormContext<FormValues>();
    const accountType = watch('context.accountType');
    const targetR = watch('rr.targetR');
    const slippageR = watch('rr.slippageR');
    const dollars =
        accountType === 'funded'
            ? plan.config.risk.fundedDollars
            : plan.config.risk.evalDollars;
    const expected = Math.max(0, targetR - slippageR);

    return (
        <div className="space-y-4">
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
                    <Label htmlFor="targetR" className="text-sm">
                        Target R
                    </Label>
                    <Input
                        id="targetR"
                        type="number"
                        step="0.1"
                        value={Number.isNaN(targetR) ? '' : targetR}
                        onChange={(e) =>
                            setValue('rr.targetR', e.target.valueAsNumber, {
                                shouldValidate: true,
                            })
                        }
                        className="mt-2 text-white"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                        Plan minimum: {plan.config.setup.minRR}R
                    </p>
                </div>
                <div className="rounded-lg border border-border/60 p-4">
                    <Label htmlFor="slippageR" className="text-sm">
                        Expected slippage (R)
                    </Label>
                    <Input
                        id="slippageR"
                        type="number"
                        step="0.05"
                        value={Number.isNaN(slippageR) ? '' : slippageR}
                        onChange={(e) =>
                            setValue('rr.slippageR', e.target.valueAsNumber, {
                                shouldValidate: true,
                            })
                        }
                        className="mt-2 text-white"
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

function FinalsStep() {
    const { watch, setValue, register } = useFormContext<FormValues>();
    const dolTaken = watch('finals.dolAlreadyTaken');
    const overExtended = watch('finals.overExtended');

    return (
        <div className="space-y-4">
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/5 p-4">
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
                        setValue('finals.dolAlreadyTaken', Boolean(v), {
                            shouldValidate: true,
                        })
                    }
                />
            </label>
            <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border/60 p-4">
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
                        setValue('finals.overExtended', Boolean(v), {
                            shouldValidate: true,
                        })
                    }
                />
            </label>
            <div className="rounded-lg border border-border/60 p-4">
                <Label htmlFor="notes" className="text-sm">
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
