'use client';

import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { zodResolver } from '@hookform/resolvers/zod';
import { GripVertical, Plus, Save, Trash2 } from 'lucide-react';
import { useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import type {
    ConfluenceKey,
    TimeWindow,
    TradingPlanConfig,
    TradingPlanRow,
} from '~/lib/trading/types';

import Eyebrow from '~/components/Eyebrow';
import { useBlockNavigationWhile } from '~/components/NavigationBlocker';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Slider } from '~/components/ui/slider';
import { Switch } from '~/components/ui/switch';
import { TimeInput } from '~/components/ui/time-input';
import {
    type UpdateTradingPlanInput,
    updateTradingPlanInputSchema,
} from '~/lib/schemas/trading';
import { updateTradingPlan } from '~/lib/trading/actions';
import {
    CONFLUENCE_GROUPS,
    KNOCKOUT_RULES,
    WEIGHT_CATEGORIES,
} from '~/lib/trading/defaults';
import { cn } from '~/lib/utilities';

export function PlanEditor({ plan }: { plan: TradingPlanRow }) {
    const [pending, startTransition] = useTransition();

    const form = useForm<UpdateTradingPlanInput>({
        defaultValues: {
            config: plan.config,
            name: plan.name,
            planId: plan.id,
        },
        resolver: zodResolver(updateTradingPlanInputSchema),
    });

    useBlockNavigationWhile(form.formState.isDirty);

    const name = useWatch({ control: form.control, name: 'name' });
    const config = useWatch({ control: form.control, name: 'config' });

    const updateConfig = <K extends keyof TradingPlanConfig>(
        key: K,
        value: TradingPlanConfig[K],
    ) =>
        form.setValue(
            'config',
            { ...form.getValues('config'), [key]: value },
            { shouldDirty: true, shouldValidate: true },
        );

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    const onWindowDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = config.windows.findIndex((w) => w.id === active.id);
        const newIndex = config.windows.findIndex((w) => w.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;
        updateConfig('windows', arrayMove(config.windows, oldIndex, newIndex));
    };

    const weightsSum = Object.values(config.weights).reduce((a, b) => a + b, 0);
    const isWeightsValid = Math.abs(weightsSum - 100) < 0.01;

    const normalizeWeights = () => {
        if (weightsSum === 0) return;
        const scale = 100 / weightsSum;
        const next = Object.fromEntries(
            Object.entries(config.weights).map(([k, v]) => [
                k,
                Math.round(v * scale),
            ]),
        ) as TradingPlanConfig['weights'];
        const remainder = 100 - Object.values(next).reduce((a, b) => a + b, 0);
        const firstKey = Object.keys(next)[0] as keyof typeof next;
        next[firstKey] += remainder;
        updateConfig('weights', next);
    };

    const onSubmit = form.handleSubmit((values) => {
        if (!isWeightsValid) {
            toast.error('Weights must sum to 100.');
            return;
        }
        const saved = { ...values, name: values.name.trim() };
        form.reset(saved);
        startTransition(async () => {
            await updateTradingPlan(saved);
        });
    });

    return (
        <form
            className={cn('app-profile__plan-editor', 'flex flex-col gap-6')}
            onSubmit={onSubmit}
        >
            <section
                className={cn('app-profile__plan-name', 'flex flex-col gap-3')}
            >
                <Label
                    className="text-xs font-medium tracking-wider text-muted-foreground uppercase"
                    htmlFor="planName"
                >
                    Plan name
                </Label>
                <Input
                    id="planName"
                    placeholder="My trading plan"
                    {...form.register('name')}
                />
            </section>

            <section
                className={cn(
                    'app-profile__plan-windows',
                    'flex flex-col gap-3',
                )}
            >
                <Eyebrow as="h3">Macro time windows</Eyebrow>
                <DndContext
                    collisionDetection={closestCenter}
                    id="windows-dnd"
                    onDragEnd={onWindowDragEnd}
                    sensors={sensors}
                >
                    <SortableContext
                        items={config.windows.map((w) => w.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="flex flex-col gap-2">
                            {config.windows.map((w, index) => (
                                <SortableWindowRow
                                    canDelete={config.windows.length > 1}
                                    key={w.id}
                                    onChange={(patch) =>
                                        updateConfig(
                                            'windows',
                                            config.windows.map((win, index_) =>
                                                index_ === index
                                                    ? {
                                                          ...win,
                                                          ...patch,
                                                      }
                                                    : win,
                                            ),
                                        )
                                    }
                                    onDelete={() =>
                                        updateConfig(
                                            'windows',
                                            config.windows.filter(
                                                (_, index_) => index_ !== index,
                                            ),
                                        )
                                    }
                                    window={w}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
                <div className="md:flex md:justify-end">
                    <Button
                        className="w-full md:w-auto"
                        onClick={() =>
                            updateConfig('windows', [
                                ...config.windows,
                                {
                                    end: '00:30',
                                    id: `w${Date.now()}`,
                                    label: 'New window',
                                    start: '00:00',
                                },
                            ])
                        }
                        size="sm"
                        type="button"
                        variant="outline"
                    >
                        <Plus className="mr-1 size-4" /> Add window
                    </Button>
                </div>
            </section>

            <section
                className={cn('app-profile__plan-risk', 'flex flex-col gap-3')}
            >
                <Eyebrow as="h3">Risk</Eyebrow>
                <div className="grid gap-3 md:grid-cols-3">
                    <div>
                        <Label className="text-sm" htmlFor="fundedR">
                            Funded risk ($)
                        </Label>
                        <Input
                            className="mt-2"
                            id="fundedR"
                            onChange={(event) =>
                                updateConfig('risk', {
                                    ...config.risk,
                                    fundedDollars: Number(event.target.value),
                                })
                            }
                            type="number"
                            value={config.risk.fundedDollars}
                        />
                    </div>
                    <div>
                        <Label className="text-sm" htmlFor="evalR">
                            Eval risk ($)
                        </Label>
                        <Input
                            className="mt-2"
                            id="evalR"
                            onChange={(event) =>
                                updateConfig('risk', {
                                    ...config.risk,
                                    evalDollars: Number(event.target.value),
                                })
                            }
                            type="number"
                            value={config.risk.evalDollars}
                        />
                    </div>
                    <div>
                        <Label className="text-sm" htmlFor="maxT">
                            Max trades / window
                        </Label>
                        <Input
                            className="mt-2"
                            id="maxT"
                            onChange={(event) =>
                                updateConfig('risk', {
                                    ...config.risk,
                                    maxTradesPerWindow: Number(
                                        event.target.value,
                                    ),
                                })
                            }
                            type="number"
                            value={config.risk.maxTradesPerWindow}
                        />
                    </div>
                </div>
            </section>

            <section
                className={cn('app-profile__plan-setup', 'flex flex-col gap-3')}
            >
                <Eyebrow as="h3">Setup requirements</Eyebrow>
                <div className="grid gap-3 md:grid-cols-2">
                    <div>
                        <Label className="text-sm" htmlFor="minRR">
                            Minimum R:R
                        </Label>
                        <Input
                            className="mt-2"
                            id="minRR"
                            onChange={(event) =>
                                updateConfig('setup', {
                                    ...config.setup,
                                    minRR: Number(event.target.value),
                                })
                            }
                            step="0.1"
                            type="number"
                            value={config.setup.minRR}
                        />
                    </div>
                    <div>
                        <Label className="text-sm" htmlFor="pdC">
                            Required PD arrays at SL
                        </Label>
                        <Input
                            className="mt-2"
                            id="pdC"
                            onChange={(event) =>
                                updateConfig('setup', {
                                    ...config.setup,
                                    requiredPdArrays: Number(
                                        event.target.value,
                                    ),
                                })
                            }
                            type="number"
                            value={config.setup.requiredPdArrays}
                        />
                    </div>
                </div>
                <div className="flex flex-col gap-4">
                    <Label className="text-sm">Confluences</Label>
                    {CONFLUENCE_GROUPS.map((group) => (
                        <div className="flex flex-col gap-2" key={group.label}>
                            <div className="flex items-center justify-between gap-2">
                                <Eyebrow as="p">{group.label}</Eyebrow>
                                <div className="flex items-center gap-2">
                                    <Button
                                        onClick={() =>
                                            updateConfig('setup', {
                                                ...config.setup,
                                                allowedConfluences:
                                                    config.setup.allowedConfluences.filter(
                                                        (x: ConfluenceKey) =>
                                                            !group.items.includes(
                                                                x,
                                                            ),
                                                    ),
                                            })
                                        }
                                        size="sm"
                                        type="button"
                                        variant="outline"
                                    >
                                        Clear
                                    </Button>
                                    <Button
                                        onClick={() => {
                                            const rest =
                                                config.setup.allowedConfluences.filter(
                                                    (x: ConfluenceKey) =>
                                                        !group.items.includes(
                                                            x,
                                                        ),
                                                );
                                            updateConfig('setup', {
                                                ...config.setup,
                                                allowedConfluences: [
                                                    ...rest,
                                                    ...group.items,
                                                ],
                                            });
                                        }}
                                        size="sm"
                                        type="button"
                                        variant="outline"
                                    >
                                        All
                                    </Button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                                {group.items.map((c) => {
                                    const isActive =
                                        config.setup.allowedConfluences.includes(
                                            c,
                                        );
                                    return (
                                        <label
                                            className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 p-2 text-sm transition hover:border-border"
                                            key={c}
                                        >
                                            <Checkbox
                                                checked={isActive}
                                                onCheckedChange={(v) =>
                                                    updateConfig('setup', {
                                                        ...config.setup,
                                                        allowedConfluences: v
                                                            ? [
                                                                  ...config
                                                                      .setup
                                                                      .allowedConfluences,
                                                                  c,
                                                              ]
                                                            : config.setup.allowedConfluences.filter(
                                                                  (
                                                                      x: ConfluenceKey,
                                                                  ) => x !== c,
                                                              ),
                                                    })
                                                }
                                            />
                                            {c}
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section
                className={cn(
                    'app-profile__plan-weights',
                    'flex flex-col gap-3',
                )}
            >
                <div className="flex items-center justify-between">
                    <Eyebrow as="h3">Scoring weights</Eyebrow>
                    <Badge variant={isWeightsValid ? 'default' : 'destructive'}>
                        Total {weightsSum.toFixed(0)} / 100
                    </Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    {WEIGHT_CATEGORIES.map(({ hint, key, label }) => (
                        <div
                            className="flex flex-col gap-2 rounded-lg border border-border/60 p-3"
                            key={key}
                        >
                            <div className="flex items-center justify-between">
                                <Label className="text-sm">{label}</Label>
                                <span className="font-mono text-sm text-foreground">
                                    {config.weights[key]}
                                </span>
                            </div>
                            <Slider
                                max={40}
                                min={0}
                                onValueChange={([v = 0]) =>
                                    updateConfig('weights', {
                                        ...config.weights,
                                        [key]: v,
                                    })
                                }
                                step={1}
                                value={[config.weights[key]]}
                            />
                            <p className="text-xs text-muted-foreground">
                                {hint}
                            </p>
                        </div>
                    ))}
                </div>
                {!isWeightsValid && (
                    <Alert variant="warning">
                        <AlertDescription className="flex items-center justify-between gap-3">
                            <span>
                                Weights must sum to 100. Currently{' '}
                                {weightsSum.toFixed(0)}.
                            </span>
                            <Button
                                onClick={normalizeWeights}
                                size="sm"
                                type="button"
                                variant="outline"
                            >
                                Normalize
                            </Button>
                        </AlertDescription>
                    </Alert>
                )}
            </section>

            <section
                className={cn(
                    'app-profile__plan-knockouts',
                    'flex flex-col gap-3',
                )}
            >
                <Eyebrow as="h3">Knockout rules</Eyebrow>
                <div className="grid gap-2 md:grid-cols-2">
                    {KNOCKOUT_RULES.map((rule) => (
                        <label
                            className="flex cursor-pointer items-center justify-between rounded-md border border-border/60 p-3"
                            key={rule.key}
                        >
                            <span className="text-sm">{rule.label}</span>
                            <Switch
                                checked={config.knockouts[rule.key]}
                                onCheckedChange={(v) =>
                                    updateConfig('knockouts', {
                                        ...config.knockouts,
                                        [rule.key]: v,
                                    })
                                }
                            />
                        </label>
                    ))}
                </div>
            </section>

            <div className="flex justify-end gap-2">
                <Button
                    disabled={pending || !isWeightsValid || !name.trim()}
                    type="submit"
                >
                    <Save className="mr-1 size-4" />
                    {pending ? 'Saving…' : 'Save changes'}
                </Button>
            </div>
        </form>
    );
}

function SortableWindowRow({
    canDelete,
    onChange,
    onDelete,
    window,
}: {
    canDelete: boolean;
    onChange: (patch: Partial<TimeWindow>) => void;
    onDelete: () => void;
    window: TimeWindow;
}) {
    const {
        attributes,
        isDragging,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: window.id });

    const style: React.CSSProperties = {
        opacity: isDragging ? 0.6 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
    };

    return (
        <div
            className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background p-3 md:flex-row md:items-center md:gap-2"
            ref={setNodeRef}
            style={style}
        >
            <div className="flex items-center gap-2 md:contents">
                <Button
                    aria-label="Drag to reorder"
                    className="size-7 shrink-0 cursor-grab touch-none p-1 text-muted-foreground active:cursor-grabbing"
                    size="sm"
                    type="button"
                    variant="ghost"
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical className="size-4" />
                </Button>
                <Input
                    className="flex-1 md:w-72 md:flex-none"
                    onChange={(event) =>
                        onChange({ label: event.target.value })
                    }
                    placeholder="Label"
                    value={window.label}
                />
                <Button
                    className="shrink-0 md:order-last"
                    disabled={!canDelete}
                    onClick={onDelete}
                    size="icon"
                    type="button"
                    variant="ghost"
                >
                    <Trash2 className="size-4" />
                </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 md:contents">
                <TimeInput
                    aria-label="Start time"
                    className="md:w-24 md:flex-none"
                    onValueChange={(start) => onChange({ start })}
                    value={window.start}
                />
                <TimeInput
                    aria-label="End time"
                    className="md:w-24 md:flex-none"
                    onValueChange={(end) => onChange({ end })}
                    value={window.end}
                />
            </div>
        </div>
    );
}
