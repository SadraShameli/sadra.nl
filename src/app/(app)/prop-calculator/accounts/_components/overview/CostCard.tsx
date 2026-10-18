import { memo } from 'react';

import { DataTable, DataTableAlign } from '~/components/ui/data-table';

import { type CostCardModel } from './overviewModel';
import { SampleBadge } from './SampleBadge';

enum AttemptsByFirmColumn {
    Attempts = 'attempts',
    CostPerAttempt = 'cost-per-attempt',
    Firm = 'firm',
    ImpliedAttempts = 'implied-attempts',
    ResetsAndRebuys = 'resets-and-rebuys',
}

enum CostByAccountSizeColumn {
    AccountSize = 'account-size',
    Attempts = 'attempts',
    CostPerAttempt = 'cost-per-attempt',
    DecidedSpend = 'decided-spend',
}

enum CostByFeeKindColumn {
    Amount = 'amount',
    FeeKind = 'fee-kind',
}

enum CostByFirmColumn {
    Firm = 'firm',
    NetSpend = 'net-spend',
}

enum CostByPlanColumn {
    Attempts = 'attempts',
    CostPerAttempt = 'cost-per-attempt',
    DecidedSpend = 'decided-spend',
    Funded = 'funded',
    ImpliedAttempts = 'implied-attempts',
    ModeledCostPerFunded = 'modeled-cost-per-funded',
    OpenEvalAttempts = 'open-eval-attempts',
    PendingSpend = 'pending-spend',
    Plan = 'plan',
    RealizedCostPerFunded = 'realized-cost-per-funded',
    RealizedMinusModeled = 'realized-minus-modeled',
}

enum FeeCheckColumn {
    DiscountVsListPrice = 'discount-vs-list-price',
    FeesChecked = 'fees-checked',
    Firm = 'firm',
}

export const CostCard = memo(function CostCard({
    model,
}: {
    readonly model: CostCardModel;
}) {
    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-foreground">
                    Net spend by firm
                </h3>
                {model.byFirm.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No fee recorded yet.
                    </p>
                ) : (
                    <DataTable
                        columns={[
                            {
                                cell: ({ row }) => <>{row.original.firm}</>,
                                header: 'Firm',
                                id: CostByFirmColumn.Firm,
                            },
                            {
                                cell: ({ row }) => <>{row.original.amount}</>,
                                header: 'Net spend',
                                id: CostByFirmColumn.NetSpend,
                                meta: { align: DataTableAlign.End },
                            },
                        ]}
                        data={[...model.byFirm]}
                        isSortable={false}
                        pageSize={null}
                        rowId={(row) => row.key}
                    />
                )}
            </div>
            {model.byKind.length > 0 && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium text-foreground">
                        Net spend by fee kind
                    </h3>
                    <DataTable
                        columns={[
                            {
                                cell: ({ row }) => <>{row.original.kind}</>,
                                header: 'Fee kind',
                                id: CostByFeeKindColumn.FeeKind,
                            },
                            {
                                cell: ({ row }) => <>{row.original.amount}</>,
                                header: 'Amount',
                                id: CostByFeeKindColumn.Amount,
                                meta: { align: DataTableAlign.End },
                            },
                        ]}
                        data={[...model.byKind]}
                        isSortable={false}
                        pageSize={null}
                        rowId={(row) => row.key}
                    />
                </div>
            )}
            <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-foreground">
                    Cost per funded account
                </h3>
                {model.perPlan.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No account with a modeled plan yet.
                    </p>
                ) : (
                    <DataTable
                        columns={[
                            {
                                cell: ({ row }) => <>{row.original.plan}</>,
                                header: 'Plan',
                                id: CostByPlanColumn.Plan,
                            },
                            {
                                cell: ({ row }) => (
                                    <>{row.original.acquisitionSpend}</>
                                ),
                                header: 'Decided spend',
                                id: CostByPlanColumn.DecidedSpend,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row }) => (
                                    <>
                                        <span className="inline-flex items-center gap-1.5">
                                            {row.original.attempts}
                                            <SampleBadge
                                                level={
                                                    row.original
                                                        .attemptsSampleLevel
                                                }
                                            />
                                        </span>
                                    </>
                                ),
                                header: 'Attempts',
                                id: CostByPlanColumn.Attempts,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row }) => (
                                    <>{row.original.costPerAttempt}</>
                                ),
                                header: 'Cost per attempt',
                                id: CostByPlanColumn.CostPerAttempt,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row }) => (
                                    <>{row.original.impliedAttempts}</>
                                ),
                                header: 'Implied attempts',
                                id: CostByPlanColumn.ImpliedAttempts,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row }) => (
                                    <>
                                        <span className="inline-flex items-center gap-1.5">
                                            {row.original.fundedAccounts}
                                            <SampleBadge
                                                level={
                                                    row.original
                                                        .fundedSampleLevel
                                                }
                                            />
                                        </span>
                                    </>
                                ),
                                header: 'Funded',
                                id: CostByPlanColumn.Funded,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row }) => (
                                    <>{row.original.costPerFunded}</>
                                ),
                                header: 'Realized cost per funded',
                                id: CostByPlanColumn.RealizedCostPerFunded,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row }) => (
                                    <>{row.original.pendingSpend}</>
                                ),
                                header: 'Pending spend',
                                id: CostByPlanColumn.PendingSpend,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row }) => (
                                    <>{row.original.pendingEvalAccounts}</>
                                ),
                                header: 'Open eval attempts',
                                id: CostByPlanColumn.OpenEvalAttempts,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row }) => (
                                    <span className="text-muted-foreground">
                                        {row.original.modeled}
                                    </span>
                                ),
                                header: 'Modeled cost per funded',
                                id: CostByPlanColumn.ModeledCostPerFunded,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row }) => (
                                    <>{row.original.realizedMinusModeled}</>
                                ),
                                header: 'Realized minus modeled',
                                id: CostByPlanColumn.RealizedMinusModeled,
                                meta: { align: DataTableAlign.End },
                            },
                        ]}
                        data={[...model.perPlan]}
                        isSortable={false}
                        pageSize={null}
                        rowId={(row) => row.key}
                    />
                )}
            </div>
            {model.byAccountSize.length > 0 && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium text-foreground">
                        Attempts and cost per attempt by account size
                    </h3>
                    <DataTable
                        columns={[
                            {
                                cell: ({ row }) => (
                                    <span className="tabular-nums">
                                        {row.original.accountSize}
                                    </span>
                                ),
                                header: 'Account size',
                                id: CostByAccountSizeColumn.AccountSize,
                            },
                            {
                                cell: ({ row }) => (
                                    <>
                                        <span className="inline-flex items-center gap-1.5">
                                            {row.original.attempts}
                                            <SampleBadge
                                                level={
                                                    row.original
                                                        .attemptsSampleLevel
                                                }
                                            />
                                        </span>
                                    </>
                                ),
                                header: 'Attempts',
                                id: CostByAccountSizeColumn.Attempts,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row }) => (
                                    <>{row.original.costPerAttempt}</>
                                ),
                                header: 'Cost per attempt',
                                id: CostByAccountSizeColumn.CostPerAttempt,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row }) => <>{row.original.spend}</>,
                                header: 'Decided spend',
                                id: CostByAccountSizeColumn.DecidedSpend,
                                meta: { align: DataTableAlign.End },
                            },
                        ]}
                        data={[...model.byAccountSize]}
                        isSortable={false}
                        pageSize={null}
                        rowId={(row) => row.key}
                    />
                </div>
            )}
            {model.byFirmAttemptCost.length > 0 && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium text-foreground">
                        Attempts and cost per attempt by firm
                    </h3>
                    <DataTable
                        columns={[
                            {
                                cell: ({ row }) => <>{row.original.firm}</>,
                                header: 'Firm',
                                id: AttemptsByFirmColumn.Firm,
                            },
                            {
                                cell: ({ row }) => (
                                    <>
                                        <span className="inline-flex items-center gap-1.5">
                                            {row.original.attempts}
                                            <SampleBadge
                                                level={
                                                    row.original
                                                        .attemptsSampleLevel
                                                }
                                            />
                                        </span>
                                    </>
                                ),
                                header: 'Attempts',
                                id: AttemptsByFirmColumn.Attempts,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row }) => (
                                    <>{row.original.costPerAttempt}</>
                                ),
                                header: 'Cost per attempt',
                                id: AttemptsByFirmColumn.CostPerAttempt,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row }) => (
                                    <>{row.original.impliedAttempts}</>
                                ),
                                header: 'Implied attempts',
                                id: AttemptsByFirmColumn.ImpliedAttempts,
                                meta: { align: DataTableAlign.End },
                            },
                            {
                                cell: ({ row }) => (
                                    <>{row.original.retryFeeAttempts}</>
                                ),
                                header: 'Resets and rebuys',
                                id: AttemptsByFirmColumn.ResetsAndRebuys,
                                meta: { align: DataTableAlign.End },
                            },
                        ]}
                        data={[...model.byFirmAttemptCost]}
                        isSortable={false}
                        pageSize={null}
                        rowId={(row) => row.key}
                    />
                </div>
            )}
            {(model.discountsByFirm.length > 0 ||
                model.discountsNote !== null) && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium text-foreground">
                        Discounts captured by firm
                    </h3>
                    {model.discountsByFirm.length > 0 && (
                        <DataTable
                            columns={[
                                {
                                    cell: ({ row }) => <>{row.original.firm}</>,
                                    header: 'Firm',
                                    id: FeeCheckColumn.Firm,
                                },
                                {
                                    cell: ({ row }) => (
                                        <>{row.original.discount}</>
                                    ),
                                    header: 'Discount vs list price',
                                    id: FeeCheckColumn.DiscountVsListPrice,
                                    meta: { align: DataTableAlign.End },
                                },
                                {
                                    cell: ({ row }) => (
                                        <>{row.original.feesChecked}</>
                                    ),
                                    header: 'Fees checked',
                                    id: FeeCheckColumn.FeesChecked,
                                    meta: { align: DataTableAlign.End },
                                },
                            ]}
                            data={[...model.discountsByFirm]}
                            isSortable={false}
                            pageSize={null}
                            rowId={(row) => row.key}
                        />
                    )}
                    {model.discountsNote !== null && (
                        <p className="text-xs text-muted-foreground">
                            {model.discountsNote}
                        </p>
                    )}
                </div>
            )}
            <Disclosures items={model.disclosures} />
        </div>
    );
});

function Disclosures({ items }: { readonly items: readonly string[] }) {
    return (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {items.map((item) => (
                <li key={item}>{item}</li>
            ))}
        </ul>
    );
}
