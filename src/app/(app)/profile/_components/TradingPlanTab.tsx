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
import {
    Check,
    Copy,
    Edit3,
    ExternalLink,
    GripVertical,
    Pencil,
    Plus,
    Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import type { TradingPlanRow } from '~/lib/trading-types';

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
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '~/components/ui/Dialog';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { Separator } from '~/components/ui/Separator';
import {
    cloneTradingPlan,
    createTradingPlan,
    deleteTradingPlan,
    reorderTradingPlans,
    setActiveTradingPlan,
} from '~/lib/trading-actions';
import { cn } from '~/lib/utils';

import { PlanEditor } from './PlanEditor';

const PLAN_TOAST_MESSAGES: Record<string, string> = {
    plan_activated: 'Active plan switched.',
    plan_cloned: 'Plan cloned.',
    plan_created: 'Plan created.',
    plan_deleted: 'Plan deleted.',
    plan_saved: 'Plan saved.',
};

const PLAN_TOAST_ERRORS: Record<string, string> = {
    plan_last_remaining: 'You must keep at least one trading plan.',
    plan_name_required: 'Plan name is required.',
    plan_not_found: 'Plan not found.',
};

export function TradingPlanTab({ plans }: { plans: TradingPlanRow[] }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [orderedPlans, setOrderedPlans] = useState(plans);
    const [editingId, setEditingId] = useState<null | string>(() => {
        const fromUrl = searchParams.get('plan');
        if (fromUrl && plans.some((p) => p.id === fromUrl)) return fromUrl;
        return plans.find((p) => p.isActive)?.id ?? plans[0]?.id ?? null;
    });
    const [newDialogOpen, setNewDialogOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [creating, startCreate] = useTransition();
    const [pendingActionId, setPendingActionId] = useState<null | string>(null);
    const [pending, startPlanAction] = useTransition();

    useEffect(() => {
        setOrderedPlans(plans);
    }, [plans]);

    const toastedRef = useRef<null | string>(null);

    useEffect(() => {
        const success = searchParams.get('success');
        const error = searchParams.get('error');
        const successMsg = success ? PLAN_TOAST_MESSAGES[success] : null;
        const errorMsg = error ? PLAN_TOAST_ERRORS[error] : null;
        if (!successMsg && !errorMsg) return;

        const key = `${success ?? ''}|${error ?? ''}|${searchParams.get('plan') ?? ''}`;
        if (toastedRef.current === key) return;
        toastedRef.current = key;

        if (successMsg) toast.success(successMsg);
        if (errorMsg) toast.error(errorMsg);

        const sp = new URLSearchParams(searchParams.toString());
        if (successMsg) sp.delete('success');
        if (errorMsg) sp.delete('error');
        const query = sp.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, {
            scroll: false,
        });
    }, [searchParams, router, pathname]);

    const editing = useMemo(
        () => orderedPlans.find((p) => p.id === editingId) ?? null,
        [orderedPlans, editingId],
    );

    const editorRef = useRef<HTMLDivElement | null>(null);

    const startEditing = (id: string) => {
        setEditingId(id);
        editorRef.current?.scrollIntoView({
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
        const oldIndex = orderedPlans.findIndex((p) => p.id === active.id);
        const newIndex = orderedPlans.findIndex((p) => p.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;
        const next = arrayMove(orderedPlans, oldIndex, newIndex);
        setOrderedPlans(next);
        startPlanAction(async () => {
            await reorderTradingPlans({ orderedIds: next.map((p) => p.id) });
            router.refresh();
        });
    };

    const create = () => {
        const name = newName.trim();
        if (!name) return;
        startCreate(async () => {
            await createTradingPlan({ name });
        });
    };

    const setActive = (planId: string) => {
        setPendingActionId(planId);
        startPlanAction(async () => {
            await setActiveTradingPlan({ planId });
            router.refresh();
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
            <Card>
                <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle>Your trading plans</CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button asChild size="sm" variant="outline">
                            <Link href="/trade-checklist">
                                Run checklist
                                <ExternalLink className="ml-1 size-3.5" />
                            </Link>
                        </Button>
                        <Button
                            onClick={() => setNewDialogOpen(true)}
                            size="sm"
                        >
                            <Plus className="mr-1 size-4" />
                            New plan
                        </Button>
                    </div>
                </CardHeader>
                <Separator />
                <CardContent>
                    {orderedPlans.length === 0 ? (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                            No plans yet. Create your first one.
                        </p>
                    ) : (
                        <DndContext
                            collisionDetection={closestCenter}
                            id="plans-dnd"
                            onDragEnd={onDragEnd}
                            sensors={sensors}
                        >
                            <SortableContext
                                items={orderedPlans.map((p) => p.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                <div className="flex flex-col gap-1.5">
                                    {orderedPlans.map((p) => (
                                        <SortablePlanRow
                                            canDelete={orderedPlans.length > 1}
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
                </CardContent>
            </Card>

            {editing && (
                <Card className="scroll-mt-4" ref={editorRef}>
                    <CardHeader className="flex items-center gap-2">
                        <CardTitle className="flex min-w-0 items-center gap-2">
                            <Edit3 className="size-4 shrink-0" />
                            <span className="truncate">
                                Editing: {editing.name}
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <Separator />
                    <CardContent>
                        <PlanEditor key={editing.id} plan={editing} />
                    </CardContent>
                </Card>
            )}

            <Dialog onOpenChange={setNewDialogOpen} open={newDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>New trading plan</DialogTitle>
                        <DialogDescription>
                            Starts from the default config — you can tune it
                            after.
                        </DialogDescription>
                    </DialogHeader>
                    <div>
                        <Label className="text-sm" htmlFor="newPlanName">
                            Name
                        </Label>
                        <Input
                            className="mt-2"
                            id="newPlanName"
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Funded plan"
                            value={newName}
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            onClick={() => setNewDialogOpen(false)}
                            variant="ghost"
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={creating || !newName.trim()}
                            onClick={create}
                        >
                            Create
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
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
                'flex flex-col gap-3 rounded-lg border border-border/60 bg-background p-3 transition-colors sm:flex-row sm:flex-wrap sm:items-center sm:justify-between',
            )}
            data-state={plan.isActive ? 'active' : undefined}
            ref={setNodeRef}
            style={style}
        >
            <div className="flex min-w-0 items-center gap-2">
                <button
                    aria-label="Drag to reorder"
                    className="-ml-1 cursor-grab touch-none rounded-md p-1 text-muted-foreground transition hover:text-white active:cursor-grabbing"
                    type="button"
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical className="size-4" />
                </button>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-white">
                            {plan.name}
                        </span>
                        {plan.isActive && (
                            <Badge variant="default">Active</Badge>
                        )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        Updated {new Date(plan.updatedAt).toLocaleString()}
                    </p>
                </div>
            </div>
            <div className="flex flex-wrap gap-2">
                <Button
                    onClick={() => onEdit(plan.id)}
                    size="sm"
                    variant={plan.id === editingId ? 'default' : 'outline'}
                >
                    <Pencil className="mr-1 size-3.5" />
                    Edit
                </Button>
                {!plan.isActive && (
                    <Button
                        disabled={pending && pendingActionId === plan.id}
                        onClick={() => onActivate(plan.id)}
                        size="sm"
                        variant="outline"
                    >
                        <Check className="mr-1 size-3.5" />
                        Activate
                    </Button>
                )}
                <Button
                    disabled={pending && pendingActionId === plan.id}
                    onClick={() => onClone(plan.id)}
                    size="sm"
                    variant="outline"
                >
                    <Copy className="size-3.5" />
                </Button>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button
                            disabled={!canDelete}
                            size="sm"
                            variant="outline"
                        >
                            <Trash2 className="size-3.5" />
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                Delete &ldquo;{plan.name}&rdquo;?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                Saved assessments referencing this plan keep
                                their snapshotted config — only the plan
                                template is removed.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => onDelete(plan.id)}
                            >
                                Delete
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    );
}
