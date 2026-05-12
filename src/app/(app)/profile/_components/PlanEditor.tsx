'use client';

import {
    DndContext,
    type DragEndEvent,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Save, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Alert, AlertDescription } from '~/components/ui/Alert';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Checkbox } from '~/components/ui/Checkbox';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { Slider } from '~/components/ui/Slider';
import { Switch } from '~/components/ui/Switch';
import { updateTradingPlan } from '~/lib/trading-actions';
import { CONFLUENCE_GROUPS, WEIGHT_CATEGORIES } from '~/lib/trading-defaults';
import type {
    ConfluenceKey,
    TimeWindow,
    TradingPlanConfig,
    TradingPlanRow,
} from '~/lib/trading-types';

const KNOCKOUT_LABELS: Record<keyof TradingPlanConfig['knockouts'], string> = {
    outsideMacroWindow: 'Outside macro window',
    bothSidedLiquidity: 'Both-sided liquidity',
    slNotProtected: 'Stop loss under-protected',
    dolAlreadyTaken: 'DOL already taken / invalidated',
    revengeOrFomo: 'Revenge / FOMO impulse',
    distracted: 'Distracted',
    boredomHunt: 'Boredom-driven setup hunt',
};

export function PlanEditor({ plan }: { plan: TradingPlanRow }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [name, setName] = useState(plan.name);
    const [config, setConfig] = useState<TradingPlanConfig>(plan.config);

    const updateConfig = <K extends keyof TradingPlanConfig>(
        key: K,
        value: TradingPlanConfig[K],
    ) => setConfig((c) => ({ ...c, [key]: value }));

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
        if (oldIndex < 0 || newIndex < 0) return;
        updateConfig('windows', arrayMove(config.windows, oldIndex, newIndex));
    };

    const weightsSum = Object.values(config.weights).reduce((a, b) => a + b, 0);
    const weightsValid = Math.abs(weightsSum - 100) < 0.01;

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
        next[firstKey] = next[firstKey] + remainder;
        updateConfig('weights', next);
    };

    const save = () => {
        if (!weightsValid) return;
        if (!name.trim()) return;
        startTransition(async () => {
            await updateTradingPlan(plan.id, name.trim(), config);
            router.refresh();
        });
    };

    return (
        <div className="space-y-6">
            <section className="flex flex-col space-y-3">
                <Label
                    htmlFor="planName"
                    className="text-xs text-muted-foreground uppercase"
                >
                    Plan name
                </Label>
                <Input
                    id="planName"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My trading plan"
                />
            </section>

            <section className="space-y-3">
                <h3 className="text-xs text-muted-foreground uppercase">
                    Macro time windows
                </h3>
                <DndContext
                    id="windows-dnd"
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={onWindowDragEnd}
                >
                    <SortableContext
                        items={config.windows.map((w) => w.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="space-y-2">
                            {config.windows.map((w, i) => (
                                <SortableWindowRow
                                    key={w.id}
                                    window={w}
                                    canDelete={config.windows.length > 1}
                                    onChange={(patch) =>
                                        updateConfig(
                                            'windows',
                                            config.windows.map((win, idx) =>
                                                idx === i
                                                    ? { ...win, ...patch }
                                                    : win,
                                            ),
                                        )
                                    }
                                    onDelete={() =>
                                        updateConfig(
                                            'windows',
                                            config.windows.filter(
                                                (_, idx) => idx !== i,
                                            ),
                                        )
                                    }
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                        updateConfig('windows', [
                            ...config.windows,
                            {
                                id: `w${Date.now()}`,
                                label: 'New window',
                                start: '00:00',
                                end: '00:30',
                            },
                        ])
                    }
                >
                    <Plus className="mr-1 size-4" /> Add window
                </Button>
            </section>

            <section className="space-y-3">
                <h3 className="text-xs text-muted-foreground uppercase">
                    Risk
                </h3>
                <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                        <Label htmlFor="fundedR" className="text-sm">
                            Funded risk ($)
                        </Label>
                        <Input
                            id="fundedR"
                            type="number"
                            className="mt-2"
                            value={config.risk.fundedDollars}
                            onChange={(e) =>
                                updateConfig('risk', {
                                    ...config.risk,
                                    fundedDollars: Number(e.target.value),
                                })
                            }
                        />
                    </div>
                    <div>
                        <Label htmlFor="evalR" className="text-sm">
                            Eval risk ($)
                        </Label>
                        <Input
                            id="evalR"
                            type="number"
                            className="mt-2"
                            value={config.risk.evalDollars}
                            onChange={(e) =>
                                updateConfig('risk', {
                                    ...config.risk,
                                    evalDollars: Number(e.target.value),
                                })
                            }
                        />
                    </div>
                    <div>
                        <Label htmlFor="maxT" className="text-sm">
                            Max trades / window
                        </Label>
                        <Input
                            id="maxT"
                            type="number"
                            className="mt-2"
                            value={config.risk.maxTradesPerWindow}
                            onChange={(e) =>
                                updateConfig('risk', {
                                    ...config.risk,
                                    maxTradesPerWindow: Number(e.target.value),
                                })
                            }
                        />
                    </div>
                </div>
            </section>

            <section className="space-y-3">
                <h3 className="text-xs text-muted-foreground uppercase">
                    Setup requirements
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                        <Label htmlFor="minRR" className="text-sm">
                            Minimum R:R
                        </Label>
                        <Input
                            id="minRR"
                            type="number"
                            step="0.1"
                            className="mt-2"
                            value={config.setup.minRR}
                            onChange={(e) =>
                                updateConfig('setup', {
                                    ...config.setup,
                                    minRR: Number(e.target.value),
                                })
                            }
                        />
                    </div>
                    <div>
                        <Label htmlFor="pdC" className="text-sm">
                            Required PD arrays at SL
                        </Label>
                        <Input
                            id="pdC"
                            type="number"
                            className="mt-2"
                            value={config.setup.requiredPdArrays}
                            onChange={(e) =>
                                updateConfig('setup', {
                                    ...config.setup,
                                    requiredPdArrays: Number(e.target.value),
                                })
                            }
                        />
                    </div>
                </div>
                <div className="space-y-4">
                    <Label className="text-sm">Confluences</Label>
                    {CONFLUENCE_GROUPS.map((group) => (
                        <div key={group.label} className="space-y-2">
                            <p className="text-xs text-muted-foreground uppercase">
                                {group.label}
                            </p>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {group.items.map((c) => {
                                    const active =
                                        config.setup.allowedConfluences.includes(
                                            c,
                                        );
                                    return (
                                        <label
                                            key={c}
                                            className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 p-2 text-sm transition hover:border-border"
                                        >
                                            <Checkbox
                                                checked={active}
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

            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs text-muted-foreground uppercase">
                        Scoring weights
                    </h3>
                    <Badge variant={weightsValid ? 'default' : 'destructive'}>
                        Total {weightsSum.toFixed(0)} / 100
                    </Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    {WEIGHT_CATEGORIES.map(({ key, label, hint }) => (
                        <div
                            key={key}
                            className="space-y-2 rounded-lg border border-border/60 p-3"
                        >
                            <div className="flex items-center justify-between">
                                <Label className="text-sm">{label}</Label>
                                <span className="font-mono text-sm text-white">
                                    {config.weights[key]}
                                </span>
                            </div>
                            <Slider
                                value={[config.weights[key]]}
                                min={0}
                                max={40}
                                step={1}
                                onValueChange={([v]) =>
                                    updateConfig('weights', {
                                        ...config.weights,
                                        [key]: v ?? 0,
                                    })
                                }
                            />
                            <p className="text-xs text-muted-foreground">
                                {hint}
                            </p>
                        </div>
                    ))}
                </div>
                {!weightsValid && (
                    <Alert variant="warning" persistent>
                        <AlertDescription className="flex items-center justify-between gap-3">
                            <span>
                                Weights must sum to 100. Currently{' '}
                                {weightsSum.toFixed(0)}.
                            </span>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={normalizeWeights}
                            >
                                Normalize
                            </Button>
                        </AlertDescription>
                    </Alert>
                )}
            </section>

            <section className="space-y-3">
                <h3 className="text-xs text-muted-foreground uppercase">
                    Knockout rules
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                    {(
                        Object.keys(config.knockouts) as Array<
                            keyof TradingPlanConfig['knockouts']
                        >
                    ).map((k) => (
                        <label
                            key={k}
                            className="flex cursor-pointer items-center justify-between rounded-md border border-border/60 p-3"
                        >
                            <span className="text-sm">
                                {KNOCKOUT_LABELS[k]}
                            </span>
                            <Switch
                                checked={config.knockouts[k]}
                                onCheckedChange={(v) =>
                                    updateConfig('knockouts', {
                                        ...config.knockouts,
                                        [k]: Boolean(v),
                                    })
                                }
                            />
                        </label>
                    ))}
                </div>
            </section>

            <div className="flex justify-end gap-2">
                <Button
                    onClick={save}
                    disabled={pending || !weightsValid || !name.trim()}
                >
                    <Save className="mr-1 size-4" />
                    {pending ? 'Saving…' : 'Save changes'}
                </Button>
            </div>
        </div>
    );
}

function SortableWindowRow({
    window,
    canDelete,
    onChange,
    onDelete,
}: {
    window: TimeWindow;
    canDelete: boolean;
    onChange: (patch: Partial<TimeWindow>) => void;
    onDelete: () => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: window.id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 10 : undefined,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="grid grid-cols-[auto_1fr_88px_88px_auto] items-center gap-2 rounded-lg border border-border/60 bg-background p-3"
        >
            <button
                type="button"
                aria-label="Drag to reorder"
                className="cursor-grab touch-none rounded-md p-1 text-muted-foreground transition hover:text-white active:cursor-grabbing"
                {...attributes}
                {...listeners}
            >
                <GripVertical className="size-4" />
            </button>
            <Input
                value={window.label}
                onChange={(e) => onChange({ label: e.target.value })}
                placeholder="Label"
            />
            <Input
                type="time"
                value={window.start}
                onChange={(e) => onChange({ start: e.target.value })}
            />
            <Input
                type="time"
                value={window.end}
                onChange={(e) => onChange({ end: e.target.value })}
            />
            <Button
                variant="ghost"
                size="icon"
                type="button"
                onClick={onDelete}
                disabled={!canDelete}
            >
                <Trash2 className="size-4" />
            </Button>
        </div>
    );
}
