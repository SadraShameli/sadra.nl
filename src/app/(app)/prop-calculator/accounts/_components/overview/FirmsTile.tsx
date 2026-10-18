'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { useTodayIsoDate } from '~/app/(app)/prop-calculator/_components/useTodayIsoDate';
import {
    EngagementsErrorNotice,
    JournalErrorNotice,
    QueryErrorNotice,
} from '~/app/(app)/prop-calculator/accounts/_components/QueryErrorNotice';
import { StatStrip } from '~/components/StatStrip';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { PortfolioLedger } from '~/lib/prop-accounts';
import { ALL_JOURNAL_DAYS } from '~/lib/prop-accounts/edge';
import { routes } from '~/lib/site/routes';
import { api } from '~/trpc/react';

import {
    firmsTileModelOf,
    ledgerOrDateFailure,
    OverviewSectionStatus,
    type PortfolioLoad,
} from './overviewModel';

export function FirmsTile({
    load,
    userId,
}: {
    readonly load: PortfolioLoad;
    readonly userId: string;
}) {
    const engagementsQuery = api.propAccounts.firmEngagement.list.useQuery();
    const edgeQuery = api.propAccounts.edge.summary.useQuery(ALL_JOURNAL_DAYS);
    const today = useTodayIsoDate();
    const engagements = engagementsQuery.data;
    const trades = edgeQuery.data?.summary.sampleSize ?? 0;
    const { ledger, sampleThresholds } = load;
    const computed = useMemo(
        () =>
            ledger.status === OverviewSectionStatus.Ready
                ? ledgerOrDateFailure(() =>
                      firmsTileModelOf({
                          asOf: today,
                          ledger: PortfolioLedger.fromRows(userId, {
                              ...ledger.rows,
                              firmEngagements: engagements ?? [],
                          }),
                          thresholds: sampleThresholds,
                          trades,
                      }),
                  )
                : null,
        [engagements, ledger, sampleThresholds, today, trades, userId],
    );
    if (
        computed === null ||
        engagementsQuery.isPending ||
        edgeQuery.isPending
    ) {
        return <Skeleton className="h-24 w-full" />;
    }
    if (computed.kind !== OverviewSectionStatus.Ready) {
        return (
            <QueryErrorNotice
                message={computed.message}
                title="The firms summary could not be computed"
            />
        );
    }
    const model = computed.value;
    return (
        <div className="flex flex-col gap-3">
            <StatStrip
                items={[
                    {
                        id: 'firms-used',
                        label: 'Firms used',
                        value: String(model.firmsUsed),
                    },
                    {
                        id: 'active',
                        label: 'Active',
                        value: String(model.activeFirms),
                    },
                    {
                        id: 'sent-live',
                        label: 'Sent live',
                        value: String(model.sentLive),
                    },
                    {
                        caption:
                            model.unmetConditions > 0
                                ? `${String(model.unmetConditions)} unmet`
                                : undefined,
                        id: 'scale-gate',
                        label: 'Scale gate',
                        value: <Badge>{model.scaleGateLabel}</Badge>,
                    },
                ]}
            />
            {engagementsQuery.isError && engagements === undefined && (
                <EngagementsErrorNotice
                    message={engagementsQuery.error.message}
                />
            )}
            {edgeQuery.isError && edgeQuery.data === undefined && (
                <JournalErrorNotice message={edgeQuery.error.message} />
            )}
            <Button asChild className="self-start" size="sm" variant="outline">
                <Link href={routes.propCalculator.accounts.firms}>
                    Open the firm roster and scale gate
                </Link>
            </Button>
        </div>
    );
}
