import { memo } from 'react';

import { DataTable, DataTableAlign } from '~/components/ui/data-table';

import { type ExpectedNetCardModel, ExpectedNetStatus } from './overviewModel';

enum ExpectedNetCardColumn {
    ActiveFundedSlots = 'active-funded-slots',
    DocumentedPolicyCreditInclusive = 'documented-policy-credit-inclusive',
    DocumentedPolicyMonthlyNetCreditFree = 'documented-policy-monthly-net-credit-free',
    DocumentedRequest = 'documented-request',
    DocumentedTimesSlots = 'documented-times-slots',
    OptimumRequest = 'optimum-request',
    OptimumTimesSlots = 'optimum-times-slots',
    PayoutSizeOptimumCreditInclusive = 'payout-size-optimum-credit-inclusive',
    PayoutSizeOptimumMonthlyNetCreditFree = 'payout-size-optimum-monthly-net-credit-free',
    Plan = 'plan',
    RankDocumented = 'rank-documented',
    RankOptimum = 'rank-optimum',
}

export const ExpectedNetCard = memo(function ExpectedNetCard({
    model,
}: {
    readonly model: ExpectedNetCardModel;
}) {
    if (model.rows.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                {model.statusNote ?? 'No plan to model yet.'}
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-3">
            {model.status !== ExpectedNetStatus.Ready &&
                model.statusNote !== null && (
                    <p className="text-sm text-muted-foreground" role="status">
                        {model.statusNote}
                    </p>
                )}
            <DataTable
                columns={[
                    {
                        cell: ({ row }) => (
                            <>
                                {row.original.plan}
                                {row.original.policySensitiveNote !== null && (
                                    <span className="block text-xs text-warning">
                                        {row.original.policySensitiveNote}
                                    </span>
                                )}
                            </>
                        ),
                        header: 'Plan',
                        id: ExpectedNetCardColumn.Plan,
                    },
                    {
                        cell: ({ row }) => <>{row.original.activeSlots}</>,
                        header: 'Active funded slots',
                        id: ExpectedNetCardColumn.ActiveFundedSlots,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => (
                            <>{row.original.documented.creditFree}</>
                        ),
                        header: 'Documented policy, monthly net (credit-free)',
                        id: ExpectedNetCardColumn.DocumentedPolicyMonthlyNetCreditFree,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => (
                            <span className="text-muted-foreground">
                                {row.original.documented.creditInclusive}
                            </span>
                        ),
                        header: 'Documented policy, credit-inclusive',
                        id: ExpectedNetCardColumn.DocumentedPolicyCreditInclusive,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => (
                            <>{row.original.documented.requestSize}</>
                        ),
                        header: 'Documented request',
                        id: ExpectedNetCardColumn.DocumentedRequest,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => (
                            <>{row.original.documented.totalCreditFree}</>
                        ),
                        header: 'Documented times slots',
                        id: ExpectedNetCardColumn.DocumentedTimesSlots,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => (
                            <>{row.original.optimum.creditFree}</>
                        ),
                        header: 'Payout-size optimum, monthly net (credit-free)',
                        id: ExpectedNetCardColumn.PayoutSizeOptimumMonthlyNetCreditFree,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => (
                            <span className="text-muted-foreground">
                                {row.original.optimum.creditInclusive}
                            </span>
                        ),
                        header: 'Payout-size optimum, credit-inclusive',
                        id: ExpectedNetCardColumn.PayoutSizeOptimumCreditInclusive,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => (
                            <>{row.original.optimum.requestSize}</>
                        ),
                        header: 'Optimum request',
                        id: ExpectedNetCardColumn.OptimumRequest,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => (
                            <>{row.original.optimum.totalCreditFree}</>
                        ),
                        header: 'Optimum times slots',
                        id: ExpectedNetCardColumn.OptimumTimesSlots,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => <>{row.original.rankDocumented}</>,
                        header: 'Rank, documented',
                        id: ExpectedNetCardColumn.RankDocumented,
                        meta: { align: DataTableAlign.End },
                    },
                    {
                        cell: ({ row }) => <>{row.original.rankOptimum}</>,
                        header: 'Rank, optimum',
                        id: ExpectedNetCardColumn.RankOptimum,
                        meta: { align: DataTableAlign.End },
                    },
                ]}
                data={[...model.rows]}
                isSortable={false}
                pageSize={null}
                rowId={(row) => row.key}
            />
            <div className="flex flex-col gap-2">
                {model.rows.map((row) => (
                    <p className="text-xs text-muted-foreground" key={row.key}>
                        {row.plan}: {row.labels.startBasis}, {row.labels.trials}
                        ; {row.labels.retainedCushion};{' '}
                        {row.labels.payoutPolicy}; {row.labels.lifetimeCapBasis}
                        . {row.labels.creditBasis}
                    </p>
                ))}
            </div>
            {model.rows.some((row) => row.liveTransferNotes.length > 0) && (
                <ul
                    aria-label="Live-transfer and payout-trigger assumptions behind the figures"
                    className="flex flex-col gap-1 text-xs text-muted-foreground"
                >
                    {model.rows.flatMap((row) =>
                        row.liveTransferNotes.map((note) => (
                            <li key={`${row.key}-${note}`}>
                                {row.plan}: {note}
                            </li>
                        )),
                    )}
                </ul>
            )}
            {model.refused.length > 0 && (
                <ul
                    aria-label="Runs the engine refused"
                    className="flex list-disc flex-col gap-1 pl-5 text-sm text-destructive"
                >
                    {model.refused.map((refusal) => (
                        <li key={refusal.key}>
                            {refusal.plan}, {refusal.run}: {refusal.reason}
                        </li>
                    ))}
                </ul>
            )}
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {model.disclosures.map((disclosure) => (
                    <li key={disclosure}>{disclosure}</li>
                ))}
            </ul>
        </div>
    );
});
