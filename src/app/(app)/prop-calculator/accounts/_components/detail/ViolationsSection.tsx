'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
    useFollowToday,
    useTodayIsoDate,
} from '~/app/(app)/prop-calculator/_components/useTodayIsoDate';
import { Button } from '~/components/ui/Button';
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
import { Textarea } from '~/components/ui/Textarea';
import { NOT_APPLICABLE } from '~/lib/format';
import {
    formatUsdCents,
    RuleViolationKind,
    ruleViolationKindLabel,
} from '~/lib/prop-accounts';
import { api, type RouterOutputs } from '~/trpc/react';

import {
    type ListQuery,
    ListQueryStatus,
    RemoveRecordDialog,
} from './DetailParts';
import { useRowEditing } from './useRowEditing';
import {
    emptyViolationFormValues,
    NO_LINKED_DECISION,
    violationEditFormValues,
    violationFormSchema,
    type ViolationFormValues,
} from './violationForm';

type DecisionRow =
    RouterOutputs['propAccounts']['decision']['listForAccount'][number];

type ViolationRow = RouterOutputs['propAccounts']['violation']['list'][number];

export function ViolationsSection({
    accountId,
    canRecord,
    onFailure,
    query,
}: {
    readonly accountId: string;
    readonly canRecord: boolean;
    readonly onFailure: (error: unknown) => void;
    readonly query: ListQuery<ViolationRow>;
}) {
    const { editing, startEditing, stopEditing } =
        useRowEditing<ViolationRow>();
    const utilities = api.useUtils();
    const decisionsQuery = api.propAccounts.decision.listForAccount.useQuery({
        id: accountId,
    });
    const decisions = decisionsQuery.data ?? [];
    const decisionsById = new Map(
        decisions.map((decision) => [decision.id, decision]),
    );
    const remove = api.propAccounts.violation.remove.useMutation({
        onError: onFailure,
        onSuccess: () => {
            toast.success('Violation deleted');
            return utilities.propAccounts.invalidate();
        },
    });
    const rows = query.data;
    return (
        <>
            <ListQueryStatus query={query} subject="rule violations" />
            {rows?.length === 0 && (
                <p className="text-sm text-muted-foreground">
                    No rule violations recorded yet.
                </p>
            )}
            {rows !== undefined && rows.length > 0 && (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Kind</TableHead>
                            <TableHead className="text-right">Cost</TableHead>
                            <TableHead>Linked decision</TableHead>
                            <TableHead>Note</TableHead>
                            <TableHead>
                                <span className="sr-only">Actions</span>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row) => {
                            const label = ruleViolationKindLabel(row.kind);
                            const linkedDecision =
                                row.decisionId === null
                                    ? null
                                    : (decisionsById.get(row.decisionId) ??
                                      null);
                            return (
                                <TableRow key={row.id}>
                                    <TableCell className="tabular-nums">
                                        {row.occurredOn}
                                    </TableCell>
                                    <TableCell>{label}</TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.costCents === null
                                            ? NOT_APPLICABLE
                                            : formatUsdCents(row.costCents)}
                                    </TableCell>
                                    <TableCell className="tabular-nums">
                                        {linkedDecision === null
                                            ? ''
                                            : `Decision on ${linkedDecision.decidedOn}`}
                                    </TableCell>
                                    <TableCell className="max-w-xs text-xs whitespace-pre-line text-muted-foreground">
                                        {row.note ?? ''}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-end gap-1">
                                            {canRecord && (
                                                <Button
                                                    aria-label={`Edit the ${label} violation of ${row.occurredOn}`}
                                                    onClick={(event) => {
                                                        startEditing(
                                                            row,
                                                            event.currentTarget,
                                                        );
                                                    }}
                                                    size="icon"
                                                    type="button"
                                                    variant="ghost"
                                                >
                                                    <Pencil />
                                                </Button>
                                            )}
                                            <RemoveRecordDialog
                                                confirmText="Delete"
                                                description="This permanently removes the violation from this account."
                                                isPending={remove.isPending}
                                                onConfirm={() => {
                                                    remove.mutate({
                                                        id: row.id,
                                                    });
                                                }}
                                                title="Delete this violation?"
                                                triggerLabel={`Delete the ${label} violation of ${row.occurredOn}`}
                                            />
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            )}
            {canRecord && (
                <ViolationForm
                    accountId={accountId}
                    decisions={decisions}
                    editing={editing}
                    key={editing?.id ?? 'new'}
                    onDone={stopEditing}
                    onFailure={onFailure}
                />
            )}
        </>
    );
}

function ViolationForm({
    accountId,
    decisions,
    editing,
    onDone,
    onFailure,
}: {
    readonly accountId: string;
    readonly decisions: readonly DecisionRow[];
    readonly editing: null | ViolationRow;
    readonly onDone: () => void;
    readonly onFailure: (error: unknown) => void;
}) {
    const utilities = api.useUtils();
    const create = api.propAccounts.violation.create.useMutation();
    const update = api.propAccounts.violation.update.useMutation();
    const schema = violationFormSchema(accountId);
    const today = useTodayIsoDate();
    const emptyValues = emptyViolationFormValues(today);
    const form = useForm<ViolationFormValues>({
        defaultValues:
            editing === null ? emptyValues : violationEditFormValues(editing),
        resolver: zodResolver(schema, undefined, { raw: true }),
    });
    const { setFocus } = form;
    const isEditing = editing !== null;
    useFollowToday({
        isEnabled: !isEditing,
        read: () => form.getValues('occurredOn'),
        today,
        write: (day) => {
            form.resetField('occurredOn', { defaultValue: day });
        },
    });
    const kind = form.watch('kind');

    useEffect(() => {
        if (isEditing) setFocus('kind');
    }, [isEditing, setFocus]);

    const save = async (values: ViolationFormValues) => {
        const parsed = schema.safeParse(values);
        if (!parsed.success) return;
        const draft = parsed.data;
        try {
            if (editing === null) {
                await create.mutateAsync(draft);
                toast.success('Violation recorded');
            } else {
                await update.mutateAsync({
                    costCents: draft.costCents,
                    decisionId: draft.decisionId,
                    id: editing.id,
                    kind: draft.kind,
                    note: draft.note,
                    occurredOn: draft.occurredOn,
                });
                toast.success('Violation saved');
            }
            form.reset(emptyValues);
            onDone();
        } catch (error) {
            onFailure(error);
        } finally {
            await utilities.propAccounts.invalidate();
        }
    };

    return (
        <Form {...form}>
            <form
                aria-label={
                    editing === null ? 'Add a violation' : 'Edit violation'
                }
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                noValidate
                onSubmit={(event) => {
                    void form.handleSubmit(save)(event);
                }}
            >
                <FormField
                    control={form.control}
                    name="kind"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Kind</FormLabel>
                            <Select
                                onValueChange={(next) => {
                                    const parsed = z
                                        .enum(RuleViolationKind)
                                        .safeParse(next).data;
                                    if (parsed !== undefined) {
                                        field.onChange(parsed);
                                    }
                                }}
                                value={field.value}
                            >
                                <FormControl>
                                    <SelectTrigger ref={field.ref}>
                                        <SelectValue />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {Object.values(RuleViolationKind).map(
                                        (candidate) => (
                                            <SelectItem
                                                key={candidate}
                                                value={candidate}
                                            >
                                                {ruleViolationKindLabel(
                                                    candidate,
                                                )}
                                            </SelectItem>
                                        ),
                                    )}
                                </SelectContent>
                            </Select>
                            <FormDescription>
                                {violationKindHelpText(kind)}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="occurredOn"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Date</FormLabel>
                            <FormControl>
                                <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="costCents"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Cost</FormLabel>
                            <FormControl>
                                <Input
                                    inputMode="decimal"
                                    placeholder="0.00"
                                    {...field}
                                />
                            </FormControl>
                            <FormDescription>
                                Leave blank when the dollar cost is not known. A
                                negative amount means the violation still won
                                money.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="decisionId"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Linked decision</FormLabel>
                            <Select
                                onValueChange={field.onChange}
                                value={field.value}
                            >
                                <FormControl>
                                    <SelectTrigger ref={field.ref}>
                                        <SelectValue />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value={NO_LINKED_DECISION}>
                                        No linked decision
                                    </SelectItem>
                                    {decisions.map((decision) => (
                                        <SelectItem
                                            key={decision.id}
                                            value={decision.id}
                                        >
                                            {`Decision on ${decision.decidedOn}`}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="note"
                    render={({ field }) => (
                        <FormItem className="sm:col-span-2 lg:col-span-3">
                            <FormLabel>Note</FormLabel>
                            <FormControl>
                                <Textarea rows={2} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3">
                    <Button
                        disabled={create.isPending || update.isPending}
                        type="submit"
                    >
                        {editing === null ? 'Add violation' : 'Save violation'}
                    </Button>
                    {editing !== null && (
                        <Button onClick={onDone} type="button" variant="ghost">
                            Cancel edit
                        </Button>
                    )}
                </div>
            </form>
        </Form>
    );
}

const RULE_VIOLATION_KIND_DISCLAIMER: Partial<
    Record<RuleViolationKind, string>
> = {
    [RuleViolationKind.ForcedRecovery]:
        "the documented ladder's step up after a loss is not a violation",
};

function violationKindHelpText(kind: RuleViolationKind): string {
    const disclaimer = RULE_VIOLATION_KIND_DISCLAIMER[kind];
    const label = ruleViolationKindLabel(kind);
    return disclaimer === undefined ? label : `${label}; ${disclaimer}`;
}
