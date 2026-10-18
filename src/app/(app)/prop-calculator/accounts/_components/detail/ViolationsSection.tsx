'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck } from 'lucide-react';
import { useId } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
    useFollowToday,
    useTodayIsoDate,
} from '~/app/(app)/prop-calculator/_components/useTodayIsoDate';
import { FormDialog } from '~/components/FormDialog';
import { MissingValue } from '~/components/MissingValue';
import {
    deleteRowAction,
    editRowAction,
    rowActionsColumn,
} from '~/components/RowActionsMenu';
import { DataTable, DataTableAlign } from '~/components/ui/data-table';
import { Dialog } from '~/components/ui/dialog';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
} from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { IsoDatePicker } from '~/components/ui/iso-date-picker';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import { Textarea } from '~/components/ui/textarea';
import { formatDisplayDate } from '~/lib/format';
import {
    formatUsdCents,
    RuleViolationKind,
    ruleViolationKindLabel,
} from '~/lib/prop-accounts';
import { api, type RouterOutputs } from '~/trpc/react';

import {
    AddRecordButton,
    type ListQuery,
    ListQueryStatus,
} from './DetailParts';
import { useRecordDialog } from './useRecordDialog';
import {
    emptyViolationFormValues,
    NO_LINKED_DECISION,
    violationEditFormValues,
    violationFormSchema,
    type ViolationFormValues,
} from './violationForm';

enum ViolationsSectionColumn {
    Cost = 'cost',
    Date = 'date',
    Kind = 'kind',
    LinkedDecision = 'linked-decision',
    Note = 'note',
}

export type ViolationDecisionOption = Pick<DecisionRow, 'decidedOn' | 'id'>;

type DecisionRow =
    RouterOutputs['propAccounts']['decision']['listForAccount'][number];

type ViolationRow = RouterOutputs['propAccounts']['violation']['list'][number];

export function ViolationForm({
    accountId,
    decisions,
    editing = null,
    initial,
    isDecisionLocked = false,
    onDone,
    onFailure,
}: {
    readonly accountId: string;
    readonly decisions: readonly ViolationDecisionOption[];
    readonly editing?: null | ViolationRow;
    readonly initial?: ViolationFormValues;
    readonly isDecisionLocked?: boolean;
    readonly onDone: () => void;
    readonly onFailure: (error: unknown) => void;
}) {
    const utilities = api.useUtils();
    const create = api.propAccounts.violation.create.useMutation();
    const update = api.propAccounts.violation.update.useMutation();
    const schema = violationFormSchema(accountId);
    const today = useTodayIsoDate();
    const form = useForm<ViolationFormValues>({
        defaultValues:
            editing === null
                ? (initial ?? emptyViolationFormValues(today))
                : violationEditFormValues(editing),
        resolver: zodResolver(schema, undefined, { raw: true }),
    });
    const formId = useId();
    useFollowToday({
        isEnabled: editing === null && initial === undefined,
        read: () => form.getValues('occurredOn'),
        today,
        write: (day) => {
            form.resetField('occurredOn', { defaultValue: day });
        },
    });
    const kind = useWatch({ control: form.control, name: 'kind' });

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
            onDone();
        } catch (error) {
            onFailure(error);
        } finally {
            await utilities.propAccounts.invalidate();
        }
    };

    return (
        <FormDialog
            form={form}
            onCancel={onDone}
            onSubmit={save}
            pending={create.isPending || update.isPending}
            submitLabel={editing === null ? 'Add violation' : 'Save violation'}
            title={formTitleOf(editing, initial)}
        >
            <Controller
                control={form.control}
                name="kind"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-kind`}>Kind</FieldLabel>
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
                            <SelectTrigger
                                aria-invalid={fieldState.invalid}
                                id={`${formId}-kind`}
                                ref={field.ref}
                            >
                                <SelectValue>
                                    {ruleViolationKindLabel(field.value)}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {Object.values(RuleViolationKind).map(
                                    (candidate) => (
                                        <SelectItem
                                            key={candidate}
                                            value={candidate}
                                        >
                                            {ruleViolationKindLabel(candidate)}
                                        </SelectItem>
                                    ),
                                )}
                            </SelectContent>
                        </Select>
                        <FieldDescription>
                            {violationKindHelpText(kind)}
                        </FieldDescription>
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <Controller
                control={form.control}
                name="occurredOn"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-occurredOn`}>
                            Date
                        </FieldLabel>
                        <IsoDatePicker
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-occurredOn`}
                            {...field}
                        />
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <Controller
                control={form.control}
                name="costCents"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-costCents`}>
                            Cost
                        </FieldLabel>
                        <Input
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-costCents`}
                            inputMode="decimal"
                            placeholder="0.00"
                            {...field}
                        />
                        <FieldDescription>
                            Leave blank when the dollar cost is not known. A
                            negative amount means the violation still won money.
                        </FieldDescription>
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <Controller
                control={form.control}
                name="decisionId"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-decisionId`}>
                            Linked decision
                        </FieldLabel>
                        <Select
                            disabled={isDecisionLocked}
                            onValueChange={field.onChange}
                            value={field.value}
                        >
                            <SelectTrigger
                                aria-invalid={fieldState.invalid}
                                id={`${formId}-decisionId`}
                                ref={field.ref}
                            >
                                <SelectValue>
                                    {decisionOptionLabel(
                                        field.value,
                                        decisions,
                                    )}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NO_LINKED_DECISION}>
                                    {NO_LINKED_DECISION_LABEL}
                                </SelectItem>
                                {decisions.map((decision) => (
                                    <SelectItem
                                        key={decision.id}
                                        value={decision.id}
                                    >
                                        {decisionOptionLabel(
                                            decision.id,
                                            decisions,
                                        )}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
            <Controller
                control={form.control}
                name="note"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${formId}-note`}>Note</FieldLabel>
                        <Textarea
                            aria-invalid={fieldState.invalid}
                            id={`${formId}-note`}
                            rows={2}
                            {...field}
                        />
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
        </FormDialog>
    );
}

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
    const dialog = useRecordDialog<ViolationRow>();
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
                <EmptyState
                    icon={ShieldCheck}
                    size={EmptyStateSize.Compact}
                    title="No rule violations recorded yet"
                />
            )}
            {rows !== undefined && rows.length > 0 && (
                <DataTable
                    columns={[
                        {
                            cell: ({ row: { original: row } }) => (
                                <div className="tabular-nums">
                                    {formatDisplayDate(row.occurredOn)}
                                </div>
                            ),
                            header: 'Date',
                            id: ViolationsSectionColumn.Date,
                            meta: { isRowHeader: true },
                        },
                        {
                            cell: ({ row: { original: row } }) => {
                                const label = ruleViolationKindLabel(row.kind);
                                return <>{label}</>;
                            },
                            header: 'Kind',
                            id: ViolationsSectionColumn.Kind,
                        },
                        {
                            cell: ({ row: { original: row } }) => (
                                <>
                                    {row.costCents === null ? (
                                        <MissingValue reason="No cost was recorded for this violation." />
                                    ) : (
                                        formatUsdCents(row.costCents)
                                    )}
                                </>
                            ),
                            header: 'Cost',
                            id: ViolationsSectionColumn.Cost,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row: { original: row } }) => {
                                const linkedDecision =
                                    row.decisionId === null
                                        ? null
                                        : (decisionsById.get(row.decisionId) ??
                                          null);
                                return (
                                    <div className="tabular-nums">
                                        {linkedDecision === null
                                            ? ''
                                            : `Decision on ${formatDisplayDate(linkedDecision.decidedOn)}`}
                                    </div>
                                );
                            },
                            header: 'Linked decision',
                            id: ViolationsSectionColumn.LinkedDecision,
                        },
                        {
                            cell: ({ row: { original: row } }) => (
                                <div className="max-w-xs text-xs whitespace-pre-line text-muted-foreground">
                                    {row.note ?? ''}
                                </div>
                            ),
                            header: 'Note',
                            id: ViolationsSectionColumn.Note,
                        },
                        rowActionsColumn<ViolationRow>({
                            actionsOf: (row) => [
                                ...(canRecord
                                    ? [
                                          editRowAction(() => {
                                              dialog.startEditing(row);
                                          }),
                                      ]
                                    : []),
                                deleteRowAction({
                                    description:
                                        'This permanently removes the violation from this account.',
                                    onDelete: () => {
                                        remove.mutate({ id: row.id });
                                    },
                                    title: 'Delete this violation?',
                                }),
                            ],
                            isPendingOf: (row) =>
                                remove.isPending &&
                                remove.variables.id === row.id,
                            labelOf: (row) =>
                                `the ${ruleViolationKindLabel(row.kind)} violation of ${formatDisplayDate(row.occurredOn)}`,
                        }),
                    ]}
                    data={[...rows]}
                    isSortable={false}
                    pageSize={null}
                    rowId={(row) => row.id}
                />
            )}
            {canRecord && (
                <AddRecordButton
                    label="Add violation"
                    onAdd={dialog.startAdding}
                />
            )}
            <Dialog onOpenChange={dialog.onOpenChange} open={dialog.isOpen}>
                {dialog.isOpen && (
                    <ViolationForm
                        accountId={accountId}
                        decisions={decisions}
                        editing={dialog.editing}
                        onDone={dialog.close}
                        onFailure={onFailure}
                    />
                )}
            </Dialog>
        </>
    );
}

const NO_LINKED_DECISION_LABEL = 'No linked decision';

const RULE_VIOLATION_KIND_DISCLAIMER: Partial<
    Record<RuleViolationKind, string>
> = {
    [RuleViolationKind.ForcedRecovery]:
        "the documented ladder's step up after a loss is not a violation",
};

function decisionOptionLabel(
    decisionId: string,
    decisions: readonly { readonly decidedOn: string; readonly id: string }[],
): string | undefined {
    if (decisionId === NO_LINKED_DECISION) return NO_LINKED_DECISION_LABEL;
    const decision = decisions.find((candidate) => candidate.id === decisionId);
    return decision === undefined
        ? undefined
        : `Decision on ${formatDisplayDate(decision.decidedOn)}`;
}

function formTitleOf(
    editing: null | ViolationRow,
    initial: undefined | ViolationFormValues,
): string {
    if (editing !== null) return 'Edit violation';
    return initial === undefined ? 'Add a violation' : 'Log a violation';
}

function violationKindHelpText(kind: RuleViolationKind): string {
    const disclaimer = RULE_VIOLATION_KIND_DISCLAIMER[kind];
    const label = ruleViolationKindLabel(kind);
    return disclaimer === undefined ? label : `${label}; ${disclaimer}`;
}
