import { Radar } from 'lucide-react';
import { memo } from 'react';

import { FigureText } from '~/app/(app)/prop-calculator/accounts/_components/FigureText';
import { DataTable, DataTableAlign } from '~/components/ui/data-table';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { formatDisplayDate } from '~/lib/format';

import { type LiveProximityCardModel } from './overviewModel';
import { InfoStack, OverviewPanel } from './OverviewPanel';
import { OverviewSectionId } from './overviewSections';

enum FirmWideTriggerColumn {
    Firm = 'firm',
    FirmWideTrigger = 'firm-wide-trigger',
    PaidPayoutsSince = 'paid-payouts-since',
    PayoutsLeft = 'payouts-left',
    RequestedPayouts = 'requested-payouts',
    Since = 'since',
    Source = 'source',
}

enum PerAccountTriggerColumn {
    Account = 'account',
    PaidPayouts = 'paid-payouts',
    PayoutsLeft = 'payouts-left',
    PerAccountTrigger = 'per-account-trigger',
    Plan = 'plan',
    RequestedPayouts = 'requested-payouts',
    Source = 'source',
}

export const LiveProximityCard = memo(function LiveProximityCard({
    model,
}: {
    readonly model: LiveProximityCardModel;
}) {
    const isEmpty =
        model.firms.length === 0 &&
        model.accounts.length === 0 &&
        model.singleDayFacts.length === 0 &&
        model.unlistedNote === null;
    return (
        <OverviewPanel
            info={
                <InfoStack>
                    <p>{model.disclosure}</p>
                    {model.unmeasuredNote !== null && (
                        <p>{model.unmeasuredNote}</p>
                    )}
                </InfoStack>
            }
            section={OverviewSectionId.LiveProximity}
        >
            {isEmpty && (
                <EmptyState
                    icon={Radar}
                    size={EmptyStateSize.Compact}
                    title={
                        model.openFundedAccounts === 0
                            ? 'No open funded account to measure'
                            : 'No live trigger to count down'
                    }
                />
            )}
            {model.firms.length > 0 && (
                <DataTable
                    aria-label="Payouts toward a firm-wide live trigger"
                    columns={[
                        {
                            cell: ({ row }) => (
                                <FigureText text={row.original.firm} />
                            ),
                            header: 'Firm',
                            id: FirmWideTriggerColumn.Firm,
                            meta: { isRowHeader: true },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText
                                    text={row.original.paidSinceLastLive}
                                />
                            ),
                            header: 'Paid payouts since',
                            id: FirmWideTriggerColumn.PaidPayoutsSince,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText
                                    text={row.original.requestedSinceLastLive}
                                />
                            ),
                            header: 'Requested payouts',
                            id: FirmWideTriggerColumn.RequestedPayouts,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText text={row.original.since} />
                            ),
                            header: 'Since',
                            id: FirmWideTriggerColumn.Since,
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText text={row.original.trigger} />
                            ),
                            header: 'Firm-wide trigger',
                            id: FirmWideTriggerColumn.FirmWideTrigger,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText text={row.original.remaining} />
                            ),
                            header: 'Payouts left',
                            id: FirmWideTriggerColumn.PayoutsLeft,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <span className="text-xs text-muted-foreground">
                                    {row.original.sourceText}
                                </span>
                            ),
                            header: 'Source',
                            id: FirmWideTriggerColumn.Source,
                        },
                    ]}
                    data={[...model.firms]}
                    isSortable={false}
                    pageSize={null}
                    rowId={(row) => row.key}
                />
            )}
            {model.accounts.length > 0 && (
                <DataTable
                    aria-label="Payouts toward a per-account live trigger"
                    columns={[
                        {
                            cell: ({ row }) => (
                                <FigureText text={row.original.account} />
                            ),
                            header: 'Account',
                            id: PerAccountTriggerColumn.Account,
                            meta: { isRowHeader: true },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText text={row.original.plan} />
                            ),
                            header: 'Plan',
                            id: PerAccountTriggerColumn.Plan,
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText text={row.original.paidPayouts} />
                            ),
                            header: 'Paid payouts',
                            id: PerAccountTriggerColumn.PaidPayouts,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText
                                    text={row.original.requestedPayouts}
                                />
                            ),
                            header: 'Requested payouts',
                            id: PerAccountTriggerColumn.RequestedPayouts,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText text={row.original.trigger} />
                            ),
                            header: 'Per-account trigger',
                            id: PerAccountTriggerColumn.PerAccountTrigger,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <FigureText text={row.original.remaining} />
                            ),
                            header: 'Payouts left',
                            id: PerAccountTriggerColumn.PayoutsLeft,
                            meta: { align: DataTableAlign.End },
                        },
                        {
                            cell: ({ row }) => (
                                <span className="text-xs text-muted-foreground">
                                    {row.original.sourceText}
                                </span>
                            ),
                            header: 'Source',
                            id: PerAccountTriggerColumn.Source,
                        },
                    ]}
                    data={[...model.accounts]}
                    isSortable={false}
                    pageSize={null}
                    rowId={(row) => row.key}
                />
            )}
            {model.singleDayFacts.length > 0 && (
                <ul
                    aria-label="Single-day live triggers"
                    className="flex list-disc flex-col gap-2 pl-5 text-sm"
                >
                    {model.singleDayFacts.map((fact) => (
                        <li key={fact.key}>
                            {fact.plan}: {fact.text}
                            <blockquote className="mt-1 border-l-2 border-border pl-3 text-xs text-muted-foreground">
                                {fact.quote}
                                <span className="block">
                                    {fact.source}, checked{' '}
                                    {formatDisplayDate(fact.fetchedOn)}
                                </span>
                            </blockquote>
                        </li>
                    ))}
                </ul>
            )}
            {model.unlistedNote !== null && (
                <p className="text-xs text-muted-foreground">
                    {model.unlistedNote}
                </p>
            )}
        </OverviewPanel>
    );
});
