'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '~/components/ui/button';
import {
    DataTable,
    DataTableAlign,
    type DataTableColumn,
} from '~/components/ui/data-table';
import { Input } from '~/components/ui/input';
import { errorMessage } from '~/lib/errorMessage';
import { formatCurrency } from '~/lib/format';
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
                    columns={decisionColumns(stepCents)}
                    data={[...decisions]}
                    isSortable={false}
                    pageSize={null}
                    rowId={(decision) => decision.id}
                />
            )}
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

function ActualRiskCell({ decision }: { readonly decision: DecisionRow }) {
    const [draft, setDraft] = useState('');
    const utilities = api.useUtils();
    const recordActual = api.propAccounts.decision.recordActual.useMutation({
        onError: (error) => {
            toast.error(errorMessage(error));
        },
        onSuccess: () => {
            toast.success('Actual risk recorded');
            return utilities.propAccounts.decision.invalidate();
        },
    });

    return decision.actualRiskCents === null ? (
        <div className="flex items-center justify-end gap-2">
            <Input
                aria-label={`Actual risk for the decision of ${decision.decidedOn}`}
                className="w-24"
                onChange={(event) => {
                    setDraft(event.target.value);
                }}
                type="number"
                value={draft}
            />
            <Button
                disabled={draft === '' || recordActual.isPending}
                onClick={() => {
                    const dollars = Number(draft);
                    if (!Number.isFinite(dollars) || dollars < 0) {
                        toast.error('Enter a valid risk amount');
                        return;
                    }
                    recordActual.mutate({
                        actualRiskCents: usdCentsFromDollars(dollars),
                        id: decision.id,
                    });
                }}
                size="sm"
                variant="outline"
            >
                Record actual
            </Button>
        </div>
    ) : (
        formatCurrency(usdCentsToDollars(decision.actualRiskCents), 2)
    );
}

function decisionColumns(stepCents: number): DataTableColumn<DecisionRow>[] {
    return [
        {
            cell: ({ row: { original: decision } }) => decision.decidedOn,
            header: 'Decided on',
            id: DecisionColumn.DecidedOn,
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
                <ActualRiskCell decision={decision} />
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
