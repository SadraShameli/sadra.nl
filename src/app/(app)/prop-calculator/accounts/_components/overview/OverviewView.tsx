'use client';

import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useMemo } from 'react';

import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader } from '~/components/ui/Card';
import { Skeleton } from '~/components/ui/Skeleton';
import { todayIsoDate } from '~/lib/prop-accounts';
import {
    isInvalidStoredRecord,
    PropRecord,
} from '~/lib/schemas/propAccountOutputs';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api } from '~/trpc/react';

import { AccountsTable } from '../AccountsTable';
import { AlertsCenter } from './AlertsCenter';
import { CapUsageCard } from './CapUsageCard';
import { CostCard } from './CostCard';
import { DiversificationCard } from './DiversificationCard';
import { FunnelCard } from './FunnelCard';
import { KpiRow } from './KpiRow';
import {
    buildOverview,
    type OverviewAlerts,
    type OverviewLedgerCards,
    type OverviewModel,
    type OverviewNotice,
    OverviewSectionStatus,
    type PortfolioLoadIssue,
    PortfolioSource,
} from './overviewModel';
import { RealizedOutcomesCard } from './RealizedOutcomesCard';
import { ReplacementCard } from './ReplacementCard';
import { StatementCard } from './StatementCard';
import { TimelineCard } from './TimelineCard';
import { usePortfolioData } from './usePortfolioData';

export function OverviewView({ userId }: { readonly userId: string }) {
    const load = usePortfolioData();
    const model = useMemo(
        () => buildOverview({ load, today: todayIsoDate(new Date()), userId }),
        [load, userId],
    );
    return (
        <>
            <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Prop accounts
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                        Spend, payouts received and net across every account you
                        hold, with alerts and each account&apos;s stage and
                        latest balance.
                    </p>
                </div>
                <Button asChild>
                    <Link href={routes.propCalculator.accounts.new}>
                        Add account
                    </Link>
                </Button>
            </header>
            <div className="flex flex-col gap-8">
                <LoadIssues issues={load.failures} variant="destructive" />
                <LoadIssues issues={load.stale} variant="warning" />
                {load.accounts.status === OverviewSectionStatus.Pending && (
                    <SectionSkeleton label="Loading your overview" />
                )}
                {model.hasAccounts && <OverviewSections model={model} />}
                {load.accounts.status === OverviewSectionStatus.Ready && (
                    <AccountsTable />
                )}
            </div>
        </>
    );
}

function AlertsSection({ alerts }: { readonly alerts: OverviewAlerts }) {
    return (
        <OverviewSection id="alerts" title="Alerts">
            {alerts.kind === OverviewSectionStatus.Ready && (
                <AlertsCenter alerts={alerts.alerts} />
            )}
            {alerts.kind === OverviewSectionStatus.Pending && (
                <SectionSkeleton label="Loading the alerts" />
            )}
            {alerts.kind === OverviewSectionStatus.Failed && (
                <p className="text-sm text-destructive">{alerts.message}</p>
            )}
        </OverviewSection>
    );
}

function LedgerSections({ cards }: { readonly cards: OverviewLedgerCards }) {
    return (
        <>
            <OverviewSection id="cap-usage" title="Plan cap usage">
                <CapUsageCard model={cards.capUsage} />
            </OverviewSection>
            <OverviewSection id="funnel" title="Stage funnel">
                <FunnelCard model={cards.funnel} />
            </OverviewSection>
            <OverviewSection id="diversification" title="Diversification">
                <DiversificationCard model={cards.diversification} />
            </OverviewSection>
            <OverviewSection id="costs" title="Costs">
                <CostCard model={cards.cost} />
            </OverviewSection>
            <OverviewSection id="outcomes" title="Realized outcomes">
                <RealizedOutcomesCard model={cards.outcomes} />
            </OverviewSection>
            <OverviewSection id="replacement" title="Replacement">
                <ReplacementCard model={cards.replacement} />
            </OverviewSection>
            <OverviewSection id="statement" title="Monthly statement">
                <StatementCard model={cards.statement} />
            </OverviewSection>
            <OverviewSection id="timeline" title="Timeline">
                <TimelineCard model={cards.timeline} />
            </OverviewSection>
        </>
    );
}

function LoadIssues({
    issues,
    variant,
}: {
    readonly issues: readonly PortfolioLoadIssue[];
    readonly variant: 'destructive' | 'warning';
}) {
    if (issues.length === 0) return null;
    return (
        <div className="flex flex-col gap-3">
            {issues.map((issue) => (
                <Alert key={issue.source} variant={variant}>
                    <TriangleAlert />
                    <AlertTitle>{issue.title}</AlertTitle>
                    <AlertDescription>
                        {issue.message}
                        {issue.source === PortfolioSource.Rulebook && (
                            <RulebookRepairLink />
                        )}
                    </AlertDescription>
                </Alert>
            ))}
        </div>
    );
}

function NoticeList({
    notices,
}: {
    readonly notices: readonly OverviewNotice[];
}) {
    return (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
            {notices.map((notice) => (
                <li key={notice.kind}>{notice.message}</li>
            ))}
        </ul>
    );
}

function OverviewSection({
    children,
    id,
    title,
}: {
    readonly children: ReactNode;
    readonly id: string;
    readonly title: string;
}) {
    const headingId = `prop-overview-${id}-heading`;
    return (
        <section
            aria-labelledby={headingId}
            className={cn('app-prop-accounts__overview-card')}
        >
            <Card>
                <CardHeader>
                    <h2
                        className="text-lg font-semibold tracking-tight text-white"
                        id={headingId}
                    >
                        {title}
                    </h2>
                </CardHeader>
                <CardContent>{children}</CardContent>
            </Card>
        </section>
    );
}

function OverviewSections({ model }: { readonly model: OverviewModel }) {
    const { ledger } = model;
    switch (ledger.kind) {
        case OverviewSectionStatus.Failed: {
            return (
                <>
                    <AlertsSection alerts={model.alerts} />
                    <Alert variant="destructive">
                        <TriangleAlert />
                        <AlertTitle>The ledger cards are not shown</AlertTitle>
                        <AlertDescription>{ledger.message}</AlertDescription>
                    </Alert>
                </>
            );
        }
        case OverviewSectionStatus.Pending: {
            return (
                <>
                    <AlertsSection alerts={model.alerts} />
                    <SectionSkeleton label="Loading the ledger cards" />
                </>
            );
        }
        case OverviewSectionStatus.Ready: {
            return (
                <>
                    <OverviewSection id="kpis" title="Key figures">
                        <KpiRow kpis={ledger.kpis} />
                    </OverviewSection>
                    <AlertsSection alerts={model.alerts} />
                    <OverviewSection id="notes" title="Data notes">
                        <NoticeList notices={ledger.notices} />
                    </OverviewSection>
                    <LedgerSections cards={ledger} />
                </>
            );
        }
    }
}

function RulebookRepairLink() {
    const { error } = api.propAccounts.rulebook.get.useQuery();
    if (!isInvalidStoredRecord(error, PropRecord.Rulebook)) return null;
    return (
        <div className="mt-2">
            <Button asChild size="sm" variant="outline">
                <Link href={routes.propCalculator.accounts.rulebook}>
                    Repair the rulebook
                </Link>
            </Button>
        </div>
    );
}

function SectionSkeleton({ label }: { readonly label: string }) {
    return (
        <div aria-busy="true" aria-label={label}>
            <Skeleton className="h-64 w-full" />
        </div>
    );
}
