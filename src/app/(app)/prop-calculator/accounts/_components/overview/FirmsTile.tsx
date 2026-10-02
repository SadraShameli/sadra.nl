'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { useTodayIsoDate } from '~/app/(app)/prop-calculator/_components/useTodayIsoDate';
import { SCALE_GATE_STATUS_VARIANT } from '~/app/(app)/prop-calculator/accounts/_components/scaleGateBadge';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { Skeleton } from '~/components/ui/Skeleton';
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
            <p className="text-sm text-destructive">
                The firms summary could not be computed: {computed.message}
            </p>
        );
    }
    const model = computed.value;
    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
                <span>
                    {String(model.firmsUsed)} firms used,{' '}
                    {String(model.activeFirms)} active, {String(model.sentLive)}{' '}
                    sent live.
                </span>
                <span className="flex items-center gap-2">
                    Scale gate:
                    <Badge
                        variant={
                            SCALE_GATE_STATUS_VARIANT[model.scaleGateStatus]
                        }
                    >
                        {model.scaleGateLabel}
                    </Badge>
                    {model.unmetConditions > 0 && (
                        <span className="text-xs text-muted-foreground">
                            {String(model.unmetConditions)} unmet
                        </span>
                    )}
                </span>
            </div>
            {engagementsQuery.isError && engagements === undefined && (
                <p className="text-xs text-destructive">
                    Your firm statuses could not be loaded, so every firm counts
                    as active until they load: {engagementsQuery.error.message}
                </p>
            )}
            {edgeQuery.isError && edgeQuery.data === undefined && (
                <p className="text-xs text-destructive">
                    Your journal could not be loaded, so the scale gate treats
                    your trade count as zero: {edgeQuery.error.message}
                </p>
            )}
            <Button asChild className="self-start" size="sm" variant="outline">
                <Link href={routes.propCalculator.accounts.firms}>
                    Open the firm roster and scale gate
                </Link>
            </Button>
        </div>
    );
}
