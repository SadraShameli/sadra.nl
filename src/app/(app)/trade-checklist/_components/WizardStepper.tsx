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
    useWatch,
} from 'react-hook-form';

import type { Answers, AssessmentResult } from '~/lib/schemas/trading';
import type { TradingPlanRow } from '~/lib/schemas/tradingRows';
import type { ConfluenceKey } from '~/lib/trading/types';

import Eyebrow from '~/components/Eyebrow';
import { ToolSectionHeading } from '~/components/ToolSectionHeading';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import {
    Field,
    FieldDescription,
    FieldGroup,
    FieldLabel,
} from '~/components/ui/field';
import { Progress } from '~/components/ui/progress';
import { Slider } from '~/components/ui/slider';
import { Textarea } from '~/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';
import { answersSchema } from '~/lib/schemas/trading';
import { CONFLUENCE_GROUPS } from '~/lib/trading/defaults';
import { findCurrentWindow, scoreAssessment } from '~/lib/trading/scoring';
import { cn } from '~/lib/utilities';

import {
    CheckboxCard,
    ChoiceCards,
    type ChoiceOption,
    MultiChoiceCards,
    NumberCard,
    StatusRow,
    StatusTone,
    SwitchCard,
    WIZARD_CARD_CLASS,
} from './WizardFields';

type FormValues = z.infer<typeof answersSchema>;

const DISPLACEMENT_OPTIONS: readonly ChoiceOption<
    FormValues['state']['displacement']
>[] = [
    { hint: 'Supports the trade', label: 'Toward DOL', value: 'toward' },
    { hint: 'Against the trade', label: 'Away', value: 'away' },
    { hint: 'No expansion yet', label: 'None yet', value: 'none' },
];

const DAY_TYPE_OPTIONS: readonly ChoiceOption<
    FormValues['state']['dayType']
>[] = [
    { hint: 'Favors reversal', label: 'Balanced', value: 'balanced' },
    { hint: 'Favors continuation', label: 'Imbalanced', value: 'imbalanced' },
];

const SETUP_TYPE_OPTIONS: readonly ChoiceOption<
    FormValues['state']['setupType']
>[] = [
    { hint: 'At a range extreme', label: 'Reversal', value: 'reversal' },
    {
        hint: 'Toward the HTF draw',
        label: 'Continuation',
        value: 'continuation',
    },
];

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
            'Knockouts. Any flag here means stand down: execution risk outweighs setup quality.',
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
    const [stepIndex, setStepIndex] = useState(0);
    const stepId = stepIds[stepIndex] ?? stepIds[0];

    const next = async () => {
        const isValid = await methods.trigger(stepFields[stepId]);
        if (!isValid) return;
        if (stepIndex < stepIds.length - 1) setStepIndex((index) => index + 1);
    };

    const back = () => stepIndex > 0 && setStepIndex((index) => index - 1);

    const submit = methods.handleSubmit((values) => {
        const result = scoreAssessment(plan.config, values);
        onSubmit(values, result);
    });

    const progress = ((stepIndex + 1) / stepIds.length) * 100;

    return (
        <FormProvider {...methods}>
            <Card className={cn('app-trade-checklist__wizard')}>
                <CardContent className="flex flex-col gap-6">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-2">
                            <Eyebrow as="p">
                                Step {stepIndex + 1} of {stepIds.length}
                            </Eyebrow>
                            <Badge className="font-mono" variant="secondary">
                                {Math.round(progress)}%
                            </Badge>
                        </div>
                        <Progress value={progress} />
                    </div>

                    <div className="flex flex-col gap-1">
                        <ToolSectionHeading>
                            {stepMeta[stepId].title}
                        </ToolSectionHeading>
                        <p className="m-0 text-sm text-muted-foreground">
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
                            disabled={stepIndex === 0}
                            onClick={back}
                            type="button"
                            variant="outline"
                        >
                            <ArrowLeft className="mr-1 size-4" />
                            Back
                        </Button>
                        {stepIndex < stepIds.length - 1 ? (
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
                                    'bg-success text-success-foreground hover:bg-success/90',
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
    const { control, setValue } = useFormContext<FormValues>();
    const value = useWatch({ control, name: name });
    return (
        <Field className={cn(WIZARD_CARD_CLASS, 'gap-2 px-3')}>
            <FieldLabel>{label}</FieldLabel>
            <ToggleGroup
                aria-label={`${label} bias`}
                className="grid w-full grid-cols-3"
                onValueChange={(v) =>
                    v &&
                    setValue(name, v as 'bearish' | 'bullish' | 'unclear', {
                        shouldValidate: true,
                    })
                }
                size="sm"
                type="single"
                value={value}
                variant="outline"
            >
                <ToggleGroupItem value="bullish">Bull</ToggleGroupItem>
                <ToggleGroupItem value="bearish">Bear</ToggleGroupItem>
                <ToggleGroupItem value="unclear">Unclear</ToggleGroupItem>
            </ToggleGroup>
        </Field>
    );
}

function BiasStep() {
    const { control, setValue } = useFormContext<FormValues>();
    const conviction = useWatch({ control, name: 'bias.conviction' });
    const weekly = useWatch({ control, name: 'bias.weekly' });
    const daily = useWatch({ control, name: 'bias.daily' });
    const fourHour = useWatch({ control, name: 'bias.fourHour' });
    const isShowLtf =
        weekly === 'unclear' && daily === 'unclear' && fourHour === 'unclear';

    return (
        <div className="flex flex-col gap-2">
            <div className="grid gap-2 md:grid-cols-2">
                <BiasRow label="Weekly" name="bias.weekly" />
                <BiasRow label="Daily" name="bias.daily" />
                <BiasRow label="4H" name="bias.fourHour" />
                {isShowLtf && (
                    <>
                        <BiasRow label="1H" name="bias.oneHour" />
                        <BiasRow label="15m" name="bias.fifteenMin" />
                    </>
                )}
            </div>
            <Field className={cn(WIZARD_CARD_CLASS, 'gap-3')}>
                <div className="flex items-center justify-between">
                    <FieldLabel>Bias conviction</FieldLabel>
                    <span className="font-mono text-sm text-foreground tabular-nums">
                        {conviction}/10
                    </span>
                </div>
                <Slider
                    aria-label="Bias conviction"
                    max={10}
                    min={1}
                    onValueChange={([v = 5]) =>
                        setValue('bias.conviction', v, {
                            shouldValidate: true,
                        })
                    }
                    step={1}
                    value={[conviction]}
                />
            </Field>
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
    const { control, setValue } = useFormContext<FormValues>();
    const windowId = useWatch({ control, name: 'context.windowId' });
    const accountType = useWatch({ control, name: 'context.accountType' });
    const isQuotaUsed = useWatch({ control, name: 'context.windowQuotaUsed' });

    return (
        <FieldGroup className="gap-6">
            <div className="flex flex-col gap-2">
                <ChoiceCards
                    className="md:grid-cols-4"
                    legend="Current macro window"
                    onClear={() =>
                        setValue('context.windowId', null, {
                            shouldValidate: true,
                        })
                    }
                    onValueChange={(id) =>
                        setValue('context.windowId', id, {
                            shouldValidate: true,
                        })
                    }
                    options={plan.config.windows.map((w) => ({
                        hint: w.label,
                        label: (
                            <span className="font-mono tabular-nums">
                                {w.start}–{w.end}
                            </span>
                        ),
                        value: w.id,
                    }))}
                    value={windowId}
                />
                {!windowId && (
                    <FieldDescription className="text-destructive">
                        Outside macro window: knockout active.
                    </FieldDescription>
                )}
            </div>

            <ChoiceCards
                legend="Account type"
                onValueChange={(type) =>
                    setValue('context.accountType', type, {
                        shouldValidate: true,
                    })
                }
                options={[
                    {
                        hint: `$${plan.config.risk.fundedDollars} risk`,
                        label: 'Funded',
                        value: 'funded',
                    },
                    {
                        hint: `$${plan.config.risk.evalDollars} risk`,
                        label: 'Eval',
                        value: 'eval',
                    },
                ]}
                value={accountType}
            />

            <SwitchCard
                checked={isQuotaUsed}
                description={`Plan limit: ${plan.config.risk.maxTradesPerWindow} trade(s) per window per account.`}
                flag="soft flag"
                id="context-window-quota-used"
                label="Already used this window's quota?"
                onCheckedChange={(v) =>
                    setValue('context.windowQuotaUsed', v, {
                        shouldValidate: true,
                    })
                }
            />
        </FieldGroup>
    );
}

function DolStep({ plan }: { plan: TradingPlanRow }) {
    const { control, setValue } = useFormContext<FormValues>();
    const type = useWatch({ control, name: 'dol.type' });
    const isSingular = useWatch({ control, name: 'dol.singular' });
    const isBothSided = useWatch({ control, name: 'dol.bothSided' });
    const distanceR = useWatch({ control, name: 'dol.distanceR' });

    return (
        <FieldGroup className="gap-6">
            <ChoiceCards
                className="md:grid-cols-3"
                legend="DOL type"
                onValueChange={(t) =>
                    setValue('dol.type', t, { shouldValidate: true })
                }
                options={plan.config.setup.allowedDolTypes.map((t) => ({
                    label: t,
                    value: t,
                }))}
                value={type}
            />

            <div className="grid gap-2 md:grid-cols-2">
                <SwitchCard
                    checked={isSingular}
                    description="One clear level above or below price."
                    id="dol-singular"
                    label="Singular and clearly defined DOL"
                    onCheckedChange={(v) =>
                        setValue('dol.singular', v, { shouldValidate: true })
                    }
                />
                <SwitchCard
                    checked={isBothSided}
                    description="Knockout if on: sit out until one side is taken."
                    flag="knockout"
                    id="dol-both-sided"
                    label="Both-sided liquidity?"
                    onCheckedChange={(v) =>
                        setValue('dol.bothSided', v, { shouldValidate: true })
                    }
                />
            </div>

            <NumberCard
                id="dol-distance-r"
                label="Distance to DOL (R)"
                onValueChange={(n) =>
                    setValue('dol.distanceR', n, { shouldValidate: true })
                }
                step={0.1}
                value={distanceR}
            />
        </FieldGroup>
    );
}

function EntryStep({ plan }: { plan: TradingPlanRow }) {
    const { control, setValue } = useFormContext<FormValues>();
    const confluences = useWatch({ control, name: 'entry.confluences' });

    return (
        <FieldGroup className="gap-6">
            {CONFLUENCE_GROUPS.map((group) => {
                const items = group.items.filter((c) =>
                    plan.config.setup.allowedConfluences.includes(c),
                );
                if (items.length === 0) return null;
                const groupSelected = items.filter((c) =>
                    confluences.includes(c),
                );
                const outsideGroup = confluences.filter((c) =>
                    items.every((item) => item !== c),
                );
                const setGroup = (selected: ConfluenceKey[]) =>
                    setValue(
                        'entry.confluences',
                        [...outsideGroup, ...selected],
                        { shouldValidate: true },
                    );
                return (
                    <MultiChoiceCards
                        actions={
                            <div className="flex items-center gap-2">
                                <Badge variant="secondary">
                                    {groupSelected.length}/{items.length}
                                </Badge>
                                <Button
                                    onClick={() => setGroup([])}
                                    size="sm"
                                    type="button"
                                    variant="outline"
                                >
                                    Clear
                                </Button>
                                <Button
                                    onClick={() => setGroup(items)}
                                    size="sm"
                                    type="button"
                                    variant="outline"
                                >
                                    All
                                </Button>
                            </div>
                        }
                        className="md:grid-cols-3"
                        key={group.label}
                        legend={group.label}
                        onValueChange={setGroup}
                        options={items.map((c) => ({ label: c, value: c }))}
                        value={groupSelected}
                    />
                );
            })}
        </FieldGroup>
    );
}

function FinalsStep() {
    const { control, register, setValue } = useFormContext<FormValues>();
    const isDolTaken = useWatch({ control, name: 'finals.dolAlreadyTaken' });
    const isOverExtended = useWatch({ control, name: 'finals.overExtended' });

    return (
        <FieldGroup className="gap-6">
            <div className="grid gap-2 md:grid-cols-2">
                <SwitchCard
                    checked={isDolTaken}
                    description="Knockout. If yes, the trade is invalid."
                    flag="knockout"
                    id="finals-dol-taken"
                    label="DOL already taken or invalidated"
                    onCheckedChange={(v) =>
                        setValue('finals.dolAlreadyTaken', v, {
                            shouldValidate: true,
                        })
                    }
                />
                <SwitchCard
                    checked={isOverExtended}
                    description="Soft flag: late entries get penalized in scoring."
                    flag="soft flag"
                    id="finals-over-extended"
                    label="Market already expanded too far"
                    onCheckedChange={(v) =>
                        setValue('finals.overExtended', v, {
                            shouldValidate: true,
                        })
                    }
                />
            </div>
            <Field className={cn(WIZARD_CARD_CLASS, 'gap-2')}>
                <FieldLabel htmlFor="finals-notes">Notes</FieldLabel>
                <Textarea
                    id="finals-notes"
                    placeholder="Free-form context for the journal."
                    rows={4}
                    {...register('finals.notes')}
                />
            </Field>
        </FieldGroup>
    );
}

function MentalStep() {
    const { control, setValue } = useFormContext<FormValues>();
    const rows: {
        name: keyof FormValues['mental'];
        rule: string;
        title: string;
    }[] = [
        {
            name: 'hesitation',
            rule: 'If technicals are met, execute. Don’t wait for extra confirmation from fear.',
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
            rule: 'If full focus isn’t possible, do not trade.',
            title: 'Distracted by anything?',
        },
    ];

    const mental = useWatch({ control, name: 'mental' });
    return (
        <FieldGroup className="grid gap-2 md:grid-cols-2">
            {rows.map((r) => (
                <SwitchCard
                    checked={mental[r.name]}
                    description={r.rule}
                    flag="flag"
                    id={`mental-${r.name}`}
                    key={r.name}
                    label={r.title}
                    onCheckedChange={(v) =>
                        setValue(`mental.${r.name}`, v, {
                            shouldValidate: true,
                        })
                    }
                />
            ))}
        </FieldGroup>
    );
}

function RrStep({ plan }: { plan: TradingPlanRow }) {
    const { control, setValue } = useFormContext<FormValues>();
    const accountType = useWatch({ control, name: 'context.accountType' });
    const targetR = useWatch({ control, name: 'rr.targetR' });
    const slippageR = useWatch({ control, name: 'rr.slippageR' });
    const dollars =
        accountType === 'funded'
            ? plan.config.risk.fundedDollars
            : plan.config.risk.evalDollars;
    const expected = Math.max(0, targetR - slippageR);
    const isMet = expected >= plan.config.setup.minRR;

    return (
        <FieldGroup className="gap-6">
            <div
                className={cn(
                    WIZARD_CARD_CLASS,
                    'flex items-center justify-between gap-4',
                )}
            >
                <div className="flex flex-col gap-0.5">
                    <Eyebrow as="p">Risk this trade</Eyebrow>
                    <p className="m-0 text-xs text-muted-foreground">
                        {accountType === 'funded' ? 'Funded' : 'Eval'} account
                    </p>
                </div>
                <p className="m-0 font-mono text-2xl text-foreground tabular-nums">
                    ${dollars.toLocaleString()}
                </p>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
                <NumberCard
                    description={`Plan minimum: ${plan.config.setup.minRR}R`}
                    id="rr-target-r"
                    label="Target R"
                    onValueChange={(n) =>
                        setValue('rr.targetR', n, { shouldValidate: true })
                    }
                    step={0.1}
                    value={targetR}
                />
                <NumberCard
                    id="rr-slippage-r"
                    label="Expected slippage (R)"
                    onValueChange={(n) =>
                        setValue('rr.slippageR', n, { shouldValidate: true })
                    }
                    step={0.05}
                    value={slippageR}
                />
            </div>
            <StatusRow
                detail={`Target minus slippage. Plan minimum is ${plan.config.setup.minRR}R.`}
                title={
                    isMet ? 'Meets the plan minimum' : 'Below the plan minimum'
                }
                tone={isMet ? StatusTone.Pass : StatusTone.Fail}
                value={`${expected.toFixed(2)}R`}
            />
        </FieldGroup>
    );
}

function SlStep({ plan }: { plan: TradingPlanRow }) {
    const { control, setValue } = useFormContext<FormValues>();
    const stopLoss = useWatch({ control, name: 'sl' });
    const required = plan.config.setup.requiredPdArrays;

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

    const count = rows.filter((r) => stopLoss[r.name]).length;
    const isOk = count >= required;
    return (
        <FieldGroup className="gap-6">
            <div className="grid gap-2 md:grid-cols-2">
                {rows.map((r) => (
                    <CheckboxCard
                        checked={stopLoss[r.name]}
                        description={r.hint}
                        id={`sl-${r.name}`}
                        key={r.name}
                        label={r.label}
                        onCheckedChange={(v) =>
                            setValue(`sl.${r.name}`, v, {
                                shouldValidate: true,
                            })
                        }
                    />
                ))}
            </div>
            <StatusRow
                detail={`The plan requires ${required} PD array(s) behind the stop.`}
                meter={{ filled: count, total: rows.length }}
                title={isOk ? 'Stop is protected' : 'Knockout: stop is exposed'}
                tone={isOk ? StatusTone.Pass : StatusTone.Fail}
                value={`${count}/${required}`}
            />
        </FieldGroup>
    );
}

function StateStep() {
    const { control, setValue } = useFormContext<FormValues>();
    const isSweep = useWatch({ control, name: 'state.opposingSweep' });
    const displacement = useWatch({ control, name: 'state.displacement' });
    const dayType = useWatch({ control, name: 'state.dayType' });
    const setupType = useWatch({ control, name: 'state.setupType' });

    const isCoherent =
        (dayType === 'balanced' && setupType === 'reversal') ||
        (dayType === 'imbalanced' && setupType === 'continuation');

    return (
        <FieldGroup className="gap-6">
            <SwitchCard
                checked={isSweep}
                description="Did price recently take stops in the opposite direction?"
                id="state-opposing-sweep"
                label="Recent sweep of opposing liquidity"
                onCheckedChange={(v) =>
                    setValue('state.opposingSweep', v, {
                        shouldValidate: true,
                    })
                }
            />

            <ChoiceCards
                className="grid-cols-3"
                legend="Recent displacement direction"
                onValueChange={(v) =>
                    setValue('state.displacement', v, {
                        shouldValidate: true,
                    })
                }
                options={DISPLACEMENT_OPTIONS}
                value={displacement}
            />

            <div className="grid gap-6 md:grid-cols-2">
                <ChoiceCards
                    legend="Day type"
                    onValueChange={(v) =>
                        setValue('state.dayType', v, { shouldValidate: true })
                    }
                    options={DAY_TYPE_OPTIONS}
                    value={dayType}
                />
                <ChoiceCards
                    legend="Setup type"
                    onValueChange={(v) =>
                        setValue('state.setupType', v, {
                            shouldValidate: true,
                        })
                    }
                    options={SETUP_TYPE_OPTIONS}
                    value={setupType}
                />
            </div>

            <StatusRow
                detail={
                    isCoherent
                        ? 'Day type and setup type tell the same story.'
                        : 'Balanced days favor reversal, imbalanced days favor continuation.'
                }
                title={isCoherent ? 'Coherent narrative' : 'Narrative mismatch'}
                tone={isCoherent ? StatusTone.Pass : StatusTone.Warn}
            />
        </FieldGroup>
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
