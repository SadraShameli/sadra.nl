'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PencilLine } from 'lucide-react';
import { useId, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { FormDialog } from '~/components/FormDialog';
import { RowActionKind, rowActionsColumn } from '~/components/RowActionsMenu';
import { Button } from '~/components/ui/button';
import {
    DataTable,
    DataTableAlign,
    type DataTableColumn,
} from '~/components/ui/data-table';
import { Dialog } from '~/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { errorMessage } from '~/lib/errorMessage';
import { formatCurrency, formatDisplayDate } from '~/lib/format';
import {
    type AccountStage,
    usdCents,
    usdCentsFromDollars,
    usdCentsToDollars,
} from '~/lib/prop-accounts';
import {
    decisionAdherenceOf,
    isDecisionFollowed,
} from '~/lib/prop-accounts/metrics';
import { type AdviceSource } from '~/lib/prop-calculator/advisor';
import { api, type RouterOutputs } from '~/trpc/react';

enum DecisionColumn {
    Accepted = 'accepted',
    Actual = 'actual',
    Adherence = 'adherence',
    DecidedOn = 'decided-on',
    Headline = 'headline',
}

const actualRiskFormShape = z.object({ dollars: z.string() });

const actualRiskSchema = actualRiskFormShape.transform((values, context) => {
    const dollars = Number(values.dollars);
    if (
        values.dollars.trim() === '' ||
        !Number.isFinite(dollars) ||
        dollars < 0
    ) {
        context.addIssue({
            code: 'custom',
            message: 'Enter a valid risk amount',
            path: ['dollars'],
        });
        return z.NEVER;
    }
    return usdCentsFromDollars(dollars);
});

export type DecisionRow =
    RouterOutputs['propAccounts']['decision']['listForAccount'][number];

export interface DecisionSuggestion {
    readonly acceptedRiskCents: number;
    readonly acceptedRungsCents: readonly number[];
    readonly headlineRiskCents: number;
    readonly snapshotId: null | string;
    readonly source: AdviceSource;
    readonly stage: AccountStage;
}

export function DecisionLog({
    accountId,
    decidedOn,
    decisions,
    stepCents,
    suggestion,
}: {
    readonly accountId: string;
    readonly decidedOn: string;
    readonly decisions: readonly DecisionRow[];
    readonly stepCents: number;
    readonly suggestion: DecisionSuggestion | null;
}) {
    const utilities = api.useUtils();
    const create = api.propAccounts.decision.create.useMutation({
        onError: (error) => {
            toast.error(errorMessage(error));
        },
        onSuccess: () => {
            toast.success('Suggestion accepted');
            return utilities.propAccounts.decision.invalidate();
        },
    });

    const [recording, setRecording] = useState<DecisionRow | null>(null);
    const recordActual = api.propAccounts.decision.recordActual.useMutation({
        onError: (error) => {
            toast.error(errorMessage(error));
        },
        onSuccess: () => {
            toast.success('Actual risk recorded');
            setRecording(null);
            return utilities.propAccounts.decision.invalidate();
        },
    });

    const adherence = decisionAdherenceOf(decisions, stepCents);
    const isAlreadyAccepted =
        suggestion !== null && isSuggestionAccepted(suggestion, decisions);

    return (
        <div className="flex flex-col gap-4">
            <Button
                disabled={
                    suggestion === null || isAlreadyAccepted || create.isPending
                }
                onClick={() => {
                    if (suggestion === null) return;
                    create.mutate({
                        acceptedRiskCents: suggestion.acceptedRiskCents,
                        acceptedRungsCents: [...suggestion.acceptedRungsCents],
                        accountId,
                        decidedOn,
                        headlineRiskCents: suggestion.headlineRiskCents,
                        note: null,
                        snapshotId: suggestion.snapshotId,
                        source: suggestion.source,
                        stage: suggestion.stage,
                    });
                }}
                variant="outline"
            >
                {isAlreadyAccepted ? 'Already accepted' : 'Accept size'}
            </Button>
            {adherence.rate !== null && (
                <p className="text-sm">
                    Followed {String(adherence.followed)} of{' '}
                    {String(adherence.measured)} decisions with an actual risk
                    recorded, within{' '}
                    {formatCurrency(usdCentsToDollars(usdCents(stepCents)), 2)}{' '}
                    of the accepted size.
                </p>
            )}
            {decisions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No sizing decisions have been logged yet.
                </p>
            ) : (
                <DataTable
                    columns={[
                        ...decisionColumns(stepCents),
                        rowActionsColumn<DecisionRow>({
                            actionsOf: (decision) =>
                                decision.actualRiskCents === null
                                    ? [
                                          {
                                              icon: PencilLine,
                                              kind: RowActionKind.Select,
                                              label: 'Record actual risk',
                                              onSelect: () => {
                                                  setRecording(decision);
                                              },
                                          },
                                      ]
                                    : [],
                            isPendingOf: (decision) =>
                                recordActual.isPending &&
                                recordActual.variables.id === decision.id,
                            labelOf: (decision) =>
                                `the decision of ${formatDisplayDate(decision.decidedOn)}`,
                        }),
                    ]}
                    data={[...decisions]}
                    isSortable={false}
                    pageSize={null}
                    rowId={(decision) => decision.id}
                />
            )}
            <Dialog
                onOpenChange={(isOpen) => {
                    if (!isOpen) setRecording(null);
                }}
                open={recording !== null}
            >
                {recording !== null && (
                    <ActualRiskForm
                        decision={recording}
                        isPending={recordActual.isPending}
                        onCancel={() => {
                            setRecording(null);
                        }}
                        onRecord={(actualRiskCents) => {
                            recordActual.mutate({
                                actualRiskCents,
                                id: recording.id,
                            });
                        }}
                    />
                )}
            </Dialog>
        </div>
    );
}

function adherenceText(decision: DecisionRow, stepCents: number): string {
    const followed = isDecisionFollowed(decision, stepCents);
    if (followed === null || decision.actualRiskCents === null) return '';
    const verdict = followed ? 'followed' : 'not followed';
    if (decision.acceptedRiskCents === 0) return `n/a, ${verdict}`;
    const ratio = decision.actualRiskCents / decision.acceptedRiskCents;
    return `${(ratio * 100).toFixed(0)}% of the accepted size, ${verdict}`;
}

const CURRENCY_DECIMALS = 2;

function ActualRiskForm({
    decision,
    isPending,
    onCancel,
    onRecord,
}: {
    readonly decision: DecisionRow;
    readonly isPending: boolean;
    readonly onCancel: () => void;
    readonly onRecord: (actualRiskCents: number) => void;
}) {
    const inputId = useId();
    const form = useForm({
        defaultValues: { dollars: '' },
        resolver: zodResolver(actualRiskSchema),
    });
    const dollars = useWatch({ control: form.control, name: 'dollars' });
    return (
        <FormDialog
            form={form}
            onCancel={onCancel}
            onSubmit={onRecord}
            pending={isPending}
            submitDisabled={dollars === ''}
            submitLabel="Record actual"
            title={`Actual risk for the decision of ${formatDisplayDate(decision.decidedOn)}`}
        >
            <Controller
                control={form.control}
                name="dollars"
                render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={inputId}>Actual risk</FieldLabel>
                        <Input
                            aria-invalid={fieldState.invalid}
                            id={inputId}
                            inputMode="decimal"
                            type="number"
                            {...field}
                        />
                        <FieldError errors={[fieldState.error]} />
                    </Field>
                )}
            />
        </FormDialog>
    );
}

function ActualRiskText({ decision }: { readonly decision: DecisionRow }) {
    return decision.actualRiskCents === null ? (
        <span className="text-muted-foreground">Not recorded</span>
    ) : (
        formatCurrency(
            usdCentsToDollars(decision.actualRiskCents),
            CURRENCY_DECIMALS,
        )
    );
}

function decisionColumns(stepCents: number): DataTableColumn<DecisionRow>[] {
    return [
        {
            cell: ({ row: { original: decision } }) =>
                formatDisplayDate(decision.decidedOn),
            header: 'Decided on',
            id: DecisionColumn.DecidedOn,
            meta: { isRowHeader: true },
        },
        {
            cell: ({ row: { original: decision } }) =>
                formatCurrency(
                    usdCentsToDollars(decision.headlineRiskCents),
                    CURRENCY_DECIMALS,
                ),
            header: 'Headline',
            id: DecisionColumn.Headline,
            meta: { align: DataTableAlign.End },
        },
        {
            cell: ({ row: { original: decision } }) =>
                formatCurrency(
                    usdCentsToDollars(decision.acceptedRiskCents),
                    CURRENCY_DECIMALS,
                ),
            header: 'Accepted',
            id: DecisionColumn.Accepted,
            meta: { align: DataTableAlign.End },
        },
        {
            cell: ({ row: { original: decision } }) => (
                <ActualRiskText decision={decision} />
            ),
            header: 'Actual',
            id: DecisionColumn.Actual,
            meta: { align: DataTableAlign.End },
        },
        {
            cell: ({ row: { original: decision } }) =>
                adherenceText(decision, stepCents),
            header: 'Adherence',
            id: DecisionColumn.Adherence,
        },
    ];
}

function isSuggestionAccepted(
    suggestion: DecisionSuggestion,
    decisions: readonly DecisionRow[],
): boolean {
    return (
        suggestion.snapshotId !== null &&
        decisions.some(
            (decision) =>
                decision.snapshotId === suggestion.snapshotId &&
                decision.acceptedRungsCents.length ===
                    suggestion.acceptedRungsCents.length &&
                decision.acceptedRungsCents.every(
                    (cents, index) =>
                        cents === suggestion.acceptedRungsCents[index],
                ),
        )
    );
}
