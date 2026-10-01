'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';
import { errorMessage } from '~/lib/errorMessage';
import { formatCurrency } from '~/lib/format';
import {
    type AccountStage,
    usdCentsFromDollars,
    usdCentsToDollars,
} from '~/lib/prop-accounts';
import { type AdviceSource } from '~/lib/prop-calculator/advisor';
import { api, type RouterOutputs } from '~/trpc/react';

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
    suggestion,
}: {
    readonly accountId: string;
    readonly decidedOn: string;
    readonly decisions: readonly DecisionRow[];
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

    return (
        <div className="flex flex-col gap-4">
            <Button
                disabled={suggestion === null || create.isPending}
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
                Accept size
            </Button>
            {decisions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No sizing decisions have been logged yet.
                </p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Decided on</TableHead>
                            <TableHead className="text-right">
                                Headline
                            </TableHead>
                            <TableHead className="text-right">
                                Accepted
                            </TableHead>
                            <TableHead className="text-right">Actual</TableHead>
                            <TableHead>Adherence</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {decisions.map((decision) => (
                            <DecisionRowView
                                decision={decision}
                                key={decision.id}
                            />
                        ))}
                    </TableBody>
                </Table>
            )}
        </div>
    );
}

function adherenceText(decision: DecisionRow): string {
    if (decision.actualRiskCents === null) return '';
    if (decision.acceptedRiskCents === 0) return 'n/a';
    const ratio = decision.actualRiskCents / decision.acceptedRiskCents;
    return `${(ratio * 100).toFixed(0)}% of the accepted size`;
}

function DecisionRowView({ decision }: { readonly decision: DecisionRow }) {
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

    return (
        <TableRow>
            <TableCell>{decision.decidedOn}</TableCell>
            <TableCell className="text-right tabular-nums">
                {formatCurrency(
                    usdCentsToDollars(decision.headlineRiskCents),
                    2,
                )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
                {formatCurrency(
                    usdCentsToDollars(decision.acceptedRiskCents),
                    2,
                )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
                {decision.actualRiskCents === null ? (
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
                                    actualRiskCents:
                                        usdCentsFromDollars(dollars),
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
                    formatCurrency(
                        usdCentsToDollars(decision.actualRiskCents),
                        2,
                    )
                )}
            </TableCell>
            <TableCell>{adherenceText(decision)}</TableCell>
        </TableRow>
    );
}
