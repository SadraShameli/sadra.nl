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
} from '~/components/ui/Alert-dialog';
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
import type { TradingPlanRow } from '~/lib/trading-types';
import { PlanEditor } from './PlanEditor';

const PLAN_TOAST_MESSAGES: Record<string, string> = {
    plan_created: 'Plan created.',
    plan_saved: 'Plan saved.',
    plan_deleted: 'Plan deleted.',
    plan_activated: 'Active plan switched.',
    plan_cloned: 'Plan cloned.',
};

const PLAN_TOAST_ERRORS: Record<string, string> = {
    plan_name_required: 'Plan name is required.',
    plan_last_remaining: 'You must keep at least one trading plan.',
    plan_not_found: 'Plan not found.',
};

export function TradingPlanTab({ plans }: { plans: TradingPlanRow[] }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [orderedPlans, setOrderedPlans] = useState(plans);
    const [editingId, setEditingId] = useState<string | null>(() => {
        const fromUrl = searchParams.get('plan');
        if (fromUrl && plans.some((p) => p.id === fromUrl)) return fromUrl;
        return plans.find((p) => p.isActive)?.id ?? plans[0]?.id ?? null;
    });
    const [newDialogOpen, setNewDialogOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [creating, startCreate] = useTransition();
    const [pendingActionId, setPendingActionId] = useState<string | null>(null);
    const [pending, startPlanAction] = useTransition();

    useEffect(() => {
        setOrderedPlans(plans);
    }, [plans]);

    const toastedRef = useRef<string | null>(null);

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
        if (oldIndex < 0 || newIndex < 0) return;
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
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                    <CardTitle>Your trading plans</CardTitle>
                    <div className="flex items-center gap-2">
                        <Button asChild size="sm" variant="outline">
                            <Link href="/trade-checklist">
                                Run checklist
                                <ExternalLink className="ml-1 size-3.5" />
                            </Link>
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => setNewDialogOpen(true)}
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
                            id="plans-dnd"
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={onDragEnd}
                        >
                            <SortableContext
                                items={orderedPlans.map((p) => p.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                <div className="flex flex-col gap-1.5">
                                    {orderedPlans.map((p) => (
                                        <SortablePlanRow
                                            key={p.id}
                                            plan={p}
                                            editingId={editingId}
                                            onEdit={startEditing}
                                            onActivate={setActive}
                                            onClone={clone}
                                            onDelete={remove}
                                            pending={pending}
                                            pendingActionId={pendingActionId}
                                            canDelete={orderedPlans.length > 1}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    )}
                </CardContent>
            </Card>

            {editing && (
                <Card ref={editorRef} className="scroll-mt-4">
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                        <CardTitle className="flex items-center gap-2">
                            <Edit3 className="size-4" />
                            Editing: {editing.name}
                        </CardTitle>
                    </CardHeader>
                    <Separator />
                    <CardContent>
                        <PlanEditor key={editing.id} plan={editing} />
                    </CardContent>
                </Card>
            )}

            <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>New trading plan</DialogTitle>
                        <DialogDescription>
                            Starts from the default config — you can tune it
                            after.
                        </DialogDescription>
                    </DialogHeader>
                    <div>
                        <Label htmlFor="newPlanName" className="text-sm">
                            Name
                        </Label>
                        <Input
                            id="newPlanName"
                            className="mt-2"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Funded plan"
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setNewDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={create}
                            disabled={creating || !newName.trim()}
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
    plan,
    editingId,
    onEdit,
    onActivate,
    onClone,
    onDelete,
    pending,
    pendingActionId,
    canDelete,
}: {
    plan: TradingPlanRow;
    editingId: string | null;
    onEdit: (id: string) => void;
    onActivate: (id: string) => void;
    onClone: (id: string) => void;
    onDelete: (id: string) => void;
    pending: boolean;
    pendingActionId: string | null;
    canDelete: boolean;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: plan.id });

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
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-background p-3 transition-colors"
        >
            <button
                type="button"
                aria-label="Drag to reorder"
                className="-ml-1 cursor-grab touch-none rounded-md p-1 text-muted-foreground transition hover:text-white active:cursor-grabbing"
                {...attributes}
                {...listeners}
            >
                <GripVertical className="size-4" />
            </button>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-white">{plan.name}</span>
                    {plan.isActive && <Badge variant="default">Active</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    Updated {new Date(plan.updatedAt).toLocaleString()}
                </p>
            </div>
            <div className="flex gap-2">
                <Button
                    size="sm"
                    variant={plan.id === editingId ? 'default' : 'outline'}
                    onClick={() => onEdit(plan.id)}
                >
                    <Pencil className="mr-1 size-3.5" />
                    Edit
                </Button>
                {!plan.isActive && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onActivate(plan.id)}
                        disabled={pending && pendingActionId === plan.id}
                    >
                        <Check className="mr-1 size-3.5" />
                        Activate
                    </Button>
                )}
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onClone(plan.id)}
                    disabled={pending && pendingActionId === plan.id}
                >
                    <Copy className="size-3.5" />
                </Button>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={!canDelete}
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
