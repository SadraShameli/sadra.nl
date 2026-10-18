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
import {
    Check,
    Copy,
    Edit3,
    ExternalLink,
    GripVertical,
    Plus,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
    useEffect,
    useMemo,
    useOptimistic,
    useRef,
    useState,
    useTransition,
} from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import type { TradingPlanRow } from '~/lib/trading/types';

import { DefaultTradingPlanSetup } from '~/app/(app)/trade-checklist/_components/DefaultTradingPlanSetup';
import { FormDialog } from '~/components/FormDialog';
import { FormTextField } from '~/components/FormFields';
import { BlockableLink } from '~/components/NavigationBlocker';
import {
    deleteRowAction,
    editRowAction,
    type RowAction,
    RowActionKind,
    RowActionsMenu,
} from '~/components/RowActionsMenu';
import { ToolPanel } from '~/components/ToolPanel';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Dialog } from '~/components/ui/dialog';
import { formatDisplayDateTime } from '~/lib/format';
import {
    type TradingPlanCreateInput,
    tradingPlanCreateSchema,
} from '~/lib/schemas/sensor-hub';
import { routes, sameOriginRoute } from '~/lib/site/routes';
import {
    cloneTradingPlan,
    createTradingPlan,
    deleteTradingPlan,
    reorderTradingPlans,
    setActiveTradingPlan,
} from '~/lib/trading/actions';
import { cn } from '~/lib/utilities';

import { PlanEditor } from './PlanEditor';

const PLAN_TOAST_MESSAGES: Record<string, string> = {
    plan_activated: 'Active plan switched.',
    plan_cloned: 'Plan cloned.',
    plan_created: 'Plan created.',
    plan_deleted: 'Plan deleted.',
    plan_saved: 'Plan saved.',
};

type PlanListChange = (plans: TradingPlanRow[]) => TradingPlanRow[];

const PLAN_TOAST_ERRORS: Record<string, string> = {
    plan_last_remaining: 'You must keep at least one trading plan.',
    plan_name_required: 'Plan name is required.',
    plan_not_found: 'Plan not found.',
};

export function TradingPlanTab({ plans }: { plans: TradingPlanRow[] }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParameters = useSearchParams();
    const [displayedPlans, applyOptimisticChange] = useOptimistic(
        plans,
        (current: TradingPlanRow[], change: PlanListChange) => change(current),
    );
    const [editingId, setEditingId] = useState<null | string>(() => {
        const fromUrl = searchParameters.get('plan');
        return fromUrl && plans.some((p) => p.id === fromUrl)
            ? fromUrl
            : (plans.find((p) => p.isActive)?.id ?? plans[0]?.id ?? null);
    });
    const [newDialogOpen, setNewDialogOpen] = useState(false);
    const newPlanForm = useForm<TradingPlanCreateInput>({
        defaultValues: { name: '' },
        resolver: zodResolver(tradingPlanCreateSchema),
    });
    const [creating, startCreate] = useTransition();
    const [pendingActionId, setPendingActionId] = useState<null | string>(null);
    const [pending, startPlanAction] = useTransition();

    const toastedReference = useRef<null | string>(null);

    useEffect(() => {
        const success = searchParameters.get('success');
        const error = searchParameters.get('error');
        const successMessage = success ? PLAN_TOAST_MESSAGES[success] : null;
        const errorMessage = error ? PLAN_TOAST_ERRORS[error] : null;
        if (!successMessage && !errorMessage) return;

        const key = `${success ?? ''}|${error ?? ''}|${searchParameters.get('plan') ?? ''}`;
        if (toastedReference.current === key) return;
        toastedReference.current = key;

        if (successMessage) toast.success(successMessage);
        if (errorMessage) toast.error(errorMessage);

        const sp = new URLSearchParams(searchParameters.toString());
        if (successMessage) sp.delete('success');
        if (errorMessage) sp.delete('error');
        const query = sp.toString();
        router.replace(sameOriginRoute(pathname, query), {
            scroll: false,
        });
    }, [searchParameters, router, pathname]);

    const editing = useMemo(
        () => displayedPlans.find((p) => p.id === editingId) ?? null,
        [displayedPlans, editingId],
    );

    const editorReference = useRef<HTMLDivElement | null>(null);

    const startEditing = (id: string) => {
        setEditingId(id);
        editorReference.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
        });
    };

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    const onDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = displayedPlans.findIndex((p) => p.id === active.id);
        const newIndex = displayedPlans.findIndex((p) => p.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;
        const orderedIds = arrayMove(displayedPlans, oldIndex, newIndex).map(
            (p) => p.id,
        );
        startPlanAction(async () => {
            applyOptimisticChange((current) =>
                reorderPlans(current, orderedIds),
            );
            await reorderTradingPlans({ orderedIds });
        });
    };

    const create = (values: TradingPlanCreateInput) => {
        startCreate(async () => {
            await createTradingPlan({ name: values.name });
            newPlanForm.reset();
        });
    };

    const setActive = (planId: string) => {
        setPendingActionId(planId);
        startPlanAction(async () => {
            applyOptimisticChange((current) => activatePlan(current, planId));
            await setActiveTradingPlan({ planId });
        });
    };

    const clone = (planId: string) => {
        setPendingActionId(planId);
        startPlanAction(async () => {
            await cloneTradingPlan({ planId });
        });
    };

    const remove = (planId: string) => {
        setPendingActionId(planId);
        startPlanAction(async () => {
            await deleteTradingPlan({ planId });
        });
    };

    return (
        <div
            className={cn('app-profile__trading-plans', 'flex flex-col gap-6')}
        >
            <ToolPanel
                actions={
                    <>
                        <Button asChild size="sm" variant="outline">
                            <BlockableLink href={routes.tradeChecklist.index}>
                                Run checklist
                                <ExternalLink className="ml-1 size-3.5" />
                            </BlockableLink>
                        </Button>
                        <Button
                            onClick={() => setNewDialogOpen(true)}
                            size="sm"
                        >
                            <Plus className="mr-1 size-4" />
                            New plan
                        </Button>
                    </>
                }
                title="Your trading plans"
            >
                {displayedPlans.length === 0 ? (
                    <DefaultTradingPlanSetup />
                ) : (
                    <DndContext
                        collisionDetection={closestCenter}
                        id="plans-dnd"
                        onDragEnd={onDragEnd}
                        sensors={sensors}
                    >
                        <SortableContext
                            items={displayedPlans.map((p) => p.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="flex flex-col gap-1.5">
                                {displayedPlans.map((p) => (
                                    <SortablePlanRow
                                        canDelete={displayedPlans.length > 1}
                                        editingId={editingId}
                                        key={p.id}
                                        onActivate={setActive}
                                        onClone={clone}
                                        onDelete={remove}
                                        onEdit={startEditing}
                                        pending={pending}
                                        pendingActionId={pendingActionId}
                                        plan={p}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                )}
            </ToolPanel>

            {editing && (
                <ToolPanel
                    className="scroll-mt-4"
                    ref={editorReference}
                    title={
                        <span className="flex min-w-0 items-center gap-2">
                            <Edit3 className="size-4 shrink-0" />
                            <span className="truncate">
                                Editing: {editing.name}
                            </span>
                        </span>
                    }
                >
                    <PlanEditor key={editing.id} plan={editing} />
                </ToolPanel>
            )}

            <Dialog onOpenChange={setNewDialogOpen} open={newDialogOpen}>
                <FormDialog
                    description="Starts from the default config; you can tune it after."
                    form={newPlanForm}
                    onCancel={() => setNewDialogOpen(false)}
                    onSubmit={create}
                    pending={creating}
                    pendingLabel="Creating…"
                    submitLabel="Create"
                    title="New trading plan"
                >
                    <FormTextField
                        control={newPlanForm.control}
                        label="Name"
                        name="name"
                        placeholder="Funded plan"
                    />
                </FormDialog>
            </Dialog>
        </div>
    );
}

function activatePlan(
    plans: TradingPlanRow[],
    planId: string,
): TradingPlanRow[] {
    return plans.map((plan) => ({ ...plan, isActive: plan.id === planId }));
}

function reorderPlans(
    plans: TradingPlanRow[],
    orderedIds: string[],
): TradingPlanRow[] {
    const position = new Map(orderedIds.map((id, index) => [id, index]));
    return plans.toSorted(
        (a, b) =>
            (position.get(a.id) ?? plans.length) -
            (position.get(b.id) ?? plans.length),
    );
}

function SortablePlanRow({
    canDelete,
    editingId,
    onActivate,
    onClone,
    onDelete,
    onEdit,
    pending,
    pendingActionId,
    plan,
}: {
    canDelete: boolean;
    editingId: null | string;
    onActivate: (id: string) => void;
    onClone: (id: string) => void;
    onDelete: (id: string) => void;
    onEdit: (id: string) => void;
    pending: boolean;
    pendingActionId: null | string;
    plan: TradingPlanRow;
}) {
    const {
        attributes,
        isDragging,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: plan.id });
    const isActionPending = pending && pendingActionId === plan.id;

    const style: React.CSSProperties = {
        opacity: isDragging ? 0.6 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
    };

    return (
        <div
            className={cn(
                'app-profile__plan-row',
                'flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background p-3 transition-colors',
            )}
            data-state={plan.isActive ? 'active' : undefined}
            ref={setNodeRef}
            style={style}
        >
            <div className="flex min-w-0 items-center gap-2">
                <Button
                    aria-label="Drag to reorder"
                    className="-ml-1 size-7 cursor-grab touch-none p-1 text-muted-foreground active:cursor-grabbing"
                    size="sm"
                    type="button"
                    variant="ghost"
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical className="size-4" />
                </Button>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-foreground">
                            {plan.name}
                        </span>
                        {plan.isActive && <Badge>Active</Badge>}
                        {plan.id === editingId && <Badge>Editing</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Updated {formatDisplayDateTime(plan.updatedAt)}
                    </p>
                </div>
            </div>
            <RowActionsMenu
                actions={[
                    editRowAction(() => onEdit(plan.id)),
                    ...(plan.isActive
                        ? []
                        : [
                              {
                                  icon: Check,
                                  isDisabled: isActionPending,
                                  kind: RowActionKind.Select,
                                  label: 'Activate',
                                  onSelect: () => onActivate(plan.id),
                              } satisfies RowAction,
                          ]),
                    {
                        icon: Copy,
                        isDisabled: isActionPending,
                        kind: RowActionKind.Select,
                        label: 'Duplicate',
                        onSelect: () => onClone(plan.id),
                    },
                    deleteRowAction({
                        description:
                            'Saved assessments referencing this plan keep their snapshotted config. Only the plan template is removed.',
                        isDisabled: !canDelete,
                        onDelete: () => onDelete(plan.id),
                        title: `Delete “${plan.name}”?`,
                    }),
                ]}
                label={plan.name}
            />
        </div>
    );
}
