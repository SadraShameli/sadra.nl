'use client';

import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useMemo } from 'react';

import { useTodayIsoDate } from '~/app/(app)/prop-calculator/_components/useTodayIsoDate';
import { AccountsTable } from '~/app/(app)/prop-calculator/accounts/_components/AccountsTable';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader } from '~/components/ui/Card';
import { Skeleton } from '~/components/ui/Skeleton';
import {
    isInvalidStoredRecord,
    PropRecord,
} from '~/lib/schemas/propAccountOutputs';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { api } from '~/trpc/react';

import { AlertsCenter } from './AlertsCenter';
import { AttemptEconomicsCard } from './AttemptEconomicsCard';
import { AttemptThroughputCard } from './AttemptThroughputCard';
import { BankrollCard } from './BankrollCard';
import { CapUsageCard } from './CapUsageCard';
import { CostCard } from './CostCard';
import { CushionBoardCard } from './CushionBoardCard';
import { DiversificationCard } from './DiversificationCard';
import { ExpectedNetCard } from './ExpectedNetCard';
import { ExposureCard } from './ExposureCard';
import { FirmReturnsCard } from './FirmReturnsCard';
import { FundedPayoutsCard } from './FundedPayoutsCard';
import { FunnelCard } from './FunnelCard';
import { KpiRow } from './KpiRow';
import { LiveProximityCard } from './LiveProximityCard';
import { NextPayoutCard } from './NextPayoutCard';
import {
    buildOverview,
    overviewAccountRequestsOf,
    type OverviewAlerts,
    type OverviewBoards,
    overviewEngineRequestsOf,
    type OverviewExposure,
    type OverviewLedgerCards,
    type OverviewModel,
    type OverviewNextPayout,
    type OverviewNotice,
    type OverviewProjection,
    overviewProjectionRequestsOf,
    OverviewSectionStatus,
    type OverviewViolations,
    type PortfolioLoadIssue,
    PortfolioSource,
} from './overviewModel';
import { PayoutSizesCard } from './PayoutSizesCard';
import { PooledCapCard } from './PooledCapCard';
import { ProjectionCard } from './ProjectionCard';
import { ReadinessBoardCard } from './ReadinessBoardCard';
import { RealizedOutcomesCard } from './RealizedOutcomesCard';
import { RepeatabilityCard } from './RepeatabilityCard';
import { ReplacementCard } from './ReplacementCard';
import { StatementCard } from './StatementCard';
import { TiltVarianceCard } from './TiltVarianceCard';
import { TimelineCard } from './TimelineCard';
import { useOverviewWorker } from './useOverviewWorker';
import { usePortfolioData } from './usePortfolioData';
import { ViolationsCard } from './ViolationsCard';

export function OverviewView({ userId }: { readonly userId: string }) {
    const load = usePortfolioData();
    const externalFirmsQuery = api.propAccounts.externalFirm.list.useQuery();
    const externalFirms = externalFirmsQuery.data;
    const today = useTodayIsoDate();
    const engineRequests = useMemo(
        () => [
            ...overviewEngineRequestsOf(load, userId),
            ...overviewProjectionRequestsOf(load, userId),
            ...overviewAccountRequestsOf(load, userId, today),
        ],
        [load, today, userId],
    );
    const engine = useOverviewWorker(engineRequests);
    const model = useMemo(
        () =>
            buildOverview({
                engine,
                externalFirms: externalFirms ?? [],
                load,
                today,
                userId,
            }),
        [engine, externalFirms, load, today, userId],
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
                {externalFirmsQuery.isError && (
                    <Alert variant="warning">
                        <TriangleAlert />
                        <AlertTitle>Your firms could not be loaded</AlertTitle>
                        <AlertDescription>
                            {externalFirmsQuery.error.message} Accounts at a
                            firm you added show it as an unlisted firm in the
                            cards below until your firms load.
                        </AlertDescription>
                    </Alert>
                )}
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
                <>
                    {alerts.accountStatesCaveat !== null && (
                        <p className="mb-3 text-sm text-muted-foreground">
                            {alerts.accountStatesCaveat}
                        </p>
                    )}
                    <AlertsCenter alerts={alerts.alerts} />
                </>
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

function BoardsSections({ boards }: { readonly boards: OverviewBoards }) {
    switch (boards.kind) {
        case OverviewSectionStatus.Failed: {
            return (
                <>
                    <OverviewSection id="cushion-board" title="Cushion board">
                        <p className="text-sm text-destructive">
                            {boards.message}
                        </p>
                    </OverviewSection>
                    <OverviewSection
                        id="readiness-board"
                        title="Payout readiness"
                    >
                        <p className="text-sm text-destructive">
                            {boards.message}
                        </p>
                    </OverviewSection>
                </>
            );
        }
        case OverviewSectionStatus.Pending: {
            return (
                <>
                    <OverviewSection id="cushion-board" title="Cushion board">
                        <SectionSkeleton label="Loading the cushion board" />
                    </OverviewSection>
                    <OverviewSection
                        id="readiness-board"
                        title="Payout readiness"
                    >
                        <SectionSkeleton label="Loading the payout readiness board" />
                    </OverviewSection>
                </>
            );
        }
        case OverviewSectionStatus.Ready: {
            return (
                <>
                    <OverviewSection id="cushion-board" title="Cushion board">
                        <CushionBoardCard model={boards.cushion} />
                    </OverviewSection>
                    <OverviewSection
                        id="readiness-board"
                        title="Payout readiness"
                    >
                        <ReadinessBoardCard model={boards.readiness} />
                    </OverviewSection>
                </>
            );
        }
    }
}

function ExposureSection({
    exposure,
}: {
    readonly exposure: OverviewExposure;
}) {
    return (
        <OverviewSection id="exposure" title="Exposure">
            {exposure.kind === OverviewSectionStatus.Ready && (
                <ExposureCard model={exposure.model} />
            )}
            {exposure.kind === OverviewSectionStatus.Pending && (
                <SectionSkeleton label="Loading the exposure" />
            )}
            {exposure.kind === OverviewSectionStatus.Failed && (
                <p className="text-sm text-destructive">{exposure.message}</p>
            )}
        </OverviewSection>
    );
}

function LedgerSections({
    cards,
    nextPayout,
    projection,
}: {
    readonly cards: OverviewLedgerCards;
    readonly nextPayout: OverviewNextPayout;
    readonly projection: OverviewProjection;
}) {
    return (
        <>
            <OverviewSection id="expected-net" title="Expected net">
                <ExpectedNetCard model={cards.expectedNet} />
            </OverviewSection>
            <OverviewSection
                id="fresh-start-projection"
                title="Fresh-start projection"
            >
                {projection.kind === OverviewSectionStatus.Ready && (
                    <ProjectionCard model={projection.model} />
                )}
                {projection.kind === OverviewSectionStatus.Pending && (
                    <SectionSkeleton label="Loading the fresh-start projection" />
                )}
                {projection.kind === OverviewSectionStatus.Failed && (
                    <p className="text-sm text-destructive">
                        {projection.message}
                    </p>
                )}
            </OverviewSection>
            <OverviewSection
                id="next-payout"
                title="Next payout and value from today's state"
            >
                {nextPayout.kind === OverviewSectionStatus.Ready && (
                    <NextPayoutCard model={nextPayout.model} />
                )}
                {nextPayout.kind === OverviewSectionStatus.Pending && (
                    <SectionSkeleton label="Loading the figures from each account's own state" />
                )}
                {nextPayout.kind === OverviewSectionStatus.Failed && (
                    <p className="text-sm text-destructive">
                        {nextPayout.message}
                    </p>
                )}
            </OverviewSection>
            <OverviewSection id="cap-usage" title="Plan cap usage">
                <CapUsageCard model={cards.capUsage} />
            </OverviewSection>
            <OverviewSection id="pooled-caps" title="Pooled caps">
                <PooledCapCard model={cards.pooledCaps} />
            </OverviewSection>
            <OverviewSection id="live-proximity" title="Live proximity">
                <LiveProximityCard model={cards.liveProximity} />
            </OverviewSection>
            <OverviewSection id="funnel" title="Stage funnel">
                <FunnelCard model={cards.funnel} />
            </OverviewSection>
            <OverviewSection id="tilt-variance" title="Tilt vs variance">
                <TiltVarianceCard model={cards.tiltVariance} />
            </OverviewSection>
            <OverviewSection id="diversification" title="Diversification">
                <DiversificationCard model={cards.diversification} />
            </OverviewSection>
            <OverviewSection id="costs" title="Costs">
                <CostCard model={cards.cost} />
            </OverviewSection>
            <OverviewSection id="firm-returns" title="Firm returns">
                <FirmReturnsCard model={cards.firmReturns} />
            </OverviewSection>
            <OverviewSection id="outcomes" title="Realized outcomes">
                <RealizedOutcomesCard model={cards.outcomes} />
            </OverviewSection>
            <OverviewSection id="payout-sizes" title="Payout sizes">
                <PayoutSizesCard model={cards.payoutSizes} />
            </OverviewSection>
            <OverviewSection
                id="funded-payouts"
                title="Payouts per funded account"
            >
                <FundedPayoutsCard model={cards.fundedPayouts} />
            </OverviewSection>
            <OverviewSection
                id="attempt-economics"
                title="Your attempt economics"
            >
                <AttemptEconomicsCard model={cards.attemptEconomics} />
            </OverviewSection>
            <OverviewSection id="replacement" title="Replacement">
                <ReplacementCard model={cards.replacement} />
            </OverviewSection>
            <OverviewSection id="statement" title="Monthly statement">
                <StatementCard model={cards.statement} />
            </OverviewSection>
            <OverviewSection id="attempt-throughput" title="Attempt throughput">
                <AttemptThroughputCard model={cards.attemptThroughput} />
            </OverviewSection>
            <OverviewSection id="repeatability" title="Repeatability">
                <RepeatabilityCard model={cards.repeatability} />
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
                    <ViolationsSummarySection violations={model.violations} />
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
                    <ViolationsSummarySection violations={model.violations} />
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
                    <OverviewSection id="bankroll" title="Bankroll">
                        <BankrollCard model={ledger.bankroll} />
                    </OverviewSection>
                    <AlertsSection alerts={model.alerts} />
                    <BoardsSections boards={model.boards} />
                    <ExposureSection exposure={model.exposure} />
                    <ViolationsSummarySection violations={model.violations} />
                    <OverviewSection id="notes" title="Data notes">
                        <NoticeList notices={ledger.notices} />
                    </OverviewSection>
                    <LedgerSections
                        cards={ledger}
                        nextPayout={model.nextPayout}
                        projection={model.projection}
                    />
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

function ViolationsSummarySection({
    violations,
}: {
    readonly violations: OverviewViolations;
}) {
    return (
        <OverviewSection id="violations" title="Rule violations">
            {violations.kind === OverviewSectionStatus.Ready && (
                <ViolationsCard model={violations.model} />
            )}
            {violations.kind === OverviewSectionStatus.Pending && (
                <SectionSkeleton label="Loading your rule violations" />
            )}
            {violations.kind === OverviewSectionStatus.Failed && (
                <p className="text-sm text-destructive">{violations.message}</p>
            )}
        </OverviewSection>
    );
}
