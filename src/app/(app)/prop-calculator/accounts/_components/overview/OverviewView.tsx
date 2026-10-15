'use client';

import { replaceEqualDeep } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { memo, type ReactNode, useMemo, useState } from 'react';

import { HEADER_SCROLL_MARGIN } from '~/app/(app)/_components/headerHeight';
import { useTodayIsoDate } from '~/app/(app)/prop-calculator/_components/useTodayIsoDate';
import { AccountsTableWithValues } from '~/app/(app)/prop-calculator/accounts/_components/AccountsTable';
import { DisclosureTrigger } from '~/app/(app)/prop-calculator/accounts/_components/DisclosureTrigger';
import { useAccountValuesWithEngine } from '~/app/(app)/prop-calculator/accounts/_components/useAccountValues';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader } from '~/components/ui/Card';
import { Collapsible, CollapsibleContent } from '~/components/ui/Collapsible';
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
import { EvSourcesCard } from './EvSourcesCard';
import { ExpectedNetCard } from './ExpectedNetCard';
import { ExposureCard } from './ExposureCard';
import { FirmReturnsCard } from './FirmReturnsCard';
import { FirmsTile } from './FirmsTile';
import { FundedPayoutsCard } from './FundedPayoutsCard';
import { FunnelCard } from './FunnelCard';
import { KpiRow } from './KpiRow';
import { LiveProximityCard } from './LiveProximityCard';
import { NextPayoutCard } from './NextPayoutCard';
import {
    buildOverview,
    overviewAccountRequestsOf,
    type OverviewAlerts,
    overviewEngineRequestsOf,
    type OverviewLedgerCards,
    type OverviewModel,
    type OverviewNotice,
    overviewProjectionRequestsOf,
    type OverviewSectionGap,
    OverviewSectionStatus,
    type OverviewSetup,
    overviewValueRequestsOf,
    type OverviewViolations,
    type PortfolioLoad,
    portfolioLoad,
    type PortfolioLoadIssue,
    PortfolioSource,
} from './overviewModel';
import {
    OVERVIEW_READY_LAYOUT,
    OVERVIEW_SECTION_TITLE,
    overviewSectionAnchor,
    overviewSectionHeadingId,
    OverviewSectionId,
} from './overviewSections';
import { PayoutSizesCard } from './PayoutSizesCard';
import { PayoutTimingCard } from './PayoutTimingCard';
import { PooledCapCard } from './PooledCapCard';
import { ProfitConcentrationCard } from './ProfitConcentrationCard';
import { ProjectionCard } from './ProjectionCard';
import { ReadinessBoardCard } from './ReadinessBoardCard';
import { RealizedOutcomesCard } from './RealizedOutcomesCard';
import { RepeatabilityCard } from './RepeatabilityCard';
import { ReplacementCard } from './ReplacementCard';
import { SetupChecklistCard } from './SetupChecklistCard';
import { StatementCard } from './StatementCard';
import { TiltVarianceCard } from './TiltVarianceCard';
import { TimelineCard } from './TimelineCard';
import { usePortfolioQueries } from './usePortfolioData';
import { ViolationsCard } from './ViolationsCard';

export function OverviewView({ userId }: { readonly userId: string }) {
    const load = useOverviewPortfolioData();
    const externalFirmsQuery = api.propAccounts.externalFirm.list.useQuery();
    const externalFirms = externalFirmsQuery.data;
    const today = useTodayIsoDate();
    const engineRequests = useMemo(
        () => [
            ...overviewEngineRequestsOf(load, userId),
            ...overviewProjectionRequestsOf(load, userId),
            ...overviewAccountRequestsOf(load, userId, today),
            ...overviewValueRequestsOf(load, userId),
        ],
        [load, today, userId],
    );
    const { engine, values } = useAccountValuesWithEngine({
        extraRequests: engineRequests,
        userId,
    });
    const model = useStructuralSharing(
        useMemo(
            () =>
                buildOverview({
                    engine,
                    externalFirms: externalFirms ?? [],
                    load,
                    today,
                    userId,
                }),
            [engine, externalFirms, load, today, userId],
        ),
    );
    const accountsTable = useMemo(
        () => (
            <div
                className={HEADER_SCROLL_MARGIN}
                id={overviewSectionAnchor(OverviewSectionId.Accounts)}
            >
                <AccountsTableWithValues values={values} />
            </div>
        ),
        [values],
    );
    return (
        <div className="flex flex-col gap-8">
            <LoadIssues issues={load.failures} variant="destructive" />
            <LoadIssues issues={load.stale} variant="warning" />
            {externalFirmsQuery.isError && (
                <Alert variant="warning">
                    <TriangleAlert />
                    <AlertTitle>Your firms could not be loaded</AlertTitle>
                    <AlertDescription>
                        {externalFirmsQuery.error.message} Accounts at a firm
                        you added show it as an unlisted firm in the cards below
                        until your firms load.
                    </AlertDescription>
                </Alert>
            )}
            {load.accounts.status === OverviewSectionStatus.Pending && (
                <PageSkeleton />
            )}
            {model.hasAccounts ? (
                <OverviewSections
                    accountsTable={accountsTable}
                    load={load}
                    model={model}
                    userId={userId}
                />
            ) : (
                load.accounts.status === OverviewSectionStatus.Ready &&
                accountsTable
            )}
        </div>
    );
}

function AlertsSection({ alerts }: { readonly alerts: OverviewAlerts }) {
    return (
        <OverviewSection section={OverviewSectionId.Alerts}>
            {alerts.kind === OverviewSectionStatus.Ready ? (
                <>
                    {alerts.accountStatesCaveat !== null && (
                        <p className="mb-3 text-sm text-muted-foreground">
                            {alerts.accountStatesCaveat}
                        </p>
                    )}
                    <AlertsCenter alerts={alerts.alerts} />
                </>
            ) : (
                <SectionGap gap={alerts} loadingLabel="Loading the alerts" />
            )}
        </OverviewSection>
    );
}

function isSetupShown(setup: OverviewSetup): boolean {
    switch (setup.kind) {
        case OverviewSectionStatus.Failed: {
            return true;
        }
        case OverviewSectionStatus.Pending: {
            return false;
        }
        case OverviewSectionStatus.Ready: {
            return !setup.model.isComplete;
        }
    }
}

function JumpNav({
    sections,
}: {
    readonly sections: readonly OverviewSectionId[];
}) {
    return (
        <nav aria-label="Overview sections">
            <Card className="py-3">
                <CardContent>
                    <Collapsible className="flex flex-col text-sm">
                        <DisclosureTrigger className="font-medium text-foreground">
                            Jump to a section ({String(sections.length)})
                        </DisclosureTrigger>
                        <CollapsibleContent>
                            <ul className="mt-2 grid gap-x-6 gap-y-1 md:grid-cols-2 lg:grid-cols-4">
                                {sections.map((section) => (
                                    <li key={section}>
                                        <Button
                                            asChild
                                            className="-ml-3 text-muted-foreground"
                                            size="sm"
                                            variant="link"
                                        >
                                            <a
                                                href={`#${overviewSectionAnchor(section)}`}
                                            >
                                                {
                                                    OVERVIEW_SECTION_TITLE[
                                                        section
                                                    ]
                                                }
                                            </a>
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        </CollapsibleContent>
                    </Collapsible>
                </CardContent>
            </Card>
        </nav>
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
    section,
}: {
    readonly children: ReactNode;
    readonly section: OverviewSectionId;
}) {
    const headingId = overviewSectionHeadingId(section);
    return (
        <section
            aria-labelledby={headingId}
            className={cn(
                'app-prop-accounts__overview-card',
                HEADER_SCROLL_MARGIN,
            )}
            id={overviewSectionAnchor(section)}
        >
            <Card>
                <CardHeader>
                    <h2
                        className="text-lg font-semibold tracking-tight text-white"
                        id={headingId}
                    >
                        {OVERVIEW_SECTION_TITLE[section]}
                    </h2>
                </CardHeader>
                <CardContent>{children}</CardContent>
            </Card>
        </section>
    );
}

const OverviewSections = memo(function OverviewSections({
    accountsTable,
    load,
    model,
    userId,
}: {
    readonly accountsTable: ReactNode;
    readonly load: PortfolioLoad;
    readonly model: OverviewModel;
    readonly userId: string;
}) {
    const { ledger } = model;
    switch (ledger.kind) {
        case OverviewSectionStatus.Failed: {
            return (
                <>
                    <AlertsSection alerts={model.alerts} />
                    {accountsTable}
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
                    {accountsTable}
                    <ViolationsSummarySection violations={model.violations} />
                    <SectionSkeleton label="Loading the ledger cards" />
                </>
            );
        }
        case OverviewSectionStatus.Ready: {
            const sections = OVERVIEW_READY_LAYOUT.filter(
                (section) =>
                    section !== OverviewSectionId.Setup ||
                    isSetupShown(model.setup),
            );
            return (
                <>
                    <JumpNav sections={sections} />
                    {sections.map((section) => (
                        <ReadySection
                            accountsTable={accountsTable}
                            cards={ledger}
                            key={section}
                            load={load}
                            model={model}
                            section={section}
                            userId={userId}
                        />
                    ))}
                </>
            );
        }
    }
});

function PageSkeleton() {
    return (
        <div
            aria-busy="true"
            aria-label="Loading your overview"
            className="min-h-screen"
            role="status"
        >
            <Skeleton className="h-screen w-full" />
        </div>
    );
}

function ReadySection({
    accountsTable,
    cards,
    load,
    model,
    section,
    userId,
}: {
    readonly accountsTable: ReactNode;
    readonly cards: OverviewLedgerCards;
    readonly load: PortfolioLoad;
    readonly model: OverviewModel;
    readonly section: OverviewSectionId;
    readonly userId: string;
}) {
    switch (section) {
        case OverviewSectionId.Accounts: {
            return accountsTable;
        }
        case OverviewSectionId.Alerts: {
            return <AlertsSection alerts={model.alerts} />;
        }
        case OverviewSectionId.AttemptEconomics: {
            return (
                <OverviewSection section={section}>
                    <AttemptEconomicsCard model={cards.attemptEconomics} />
                </OverviewSection>
            );
        }
        case OverviewSectionId.AttemptThroughput: {
            return (
                <OverviewSection section={section}>
                    <AttemptThroughputCard model={cards.attemptThroughput} />
                </OverviewSection>
            );
        }
        case OverviewSectionId.Bankroll: {
            return (
                <OverviewSection section={section}>
                    <BankrollCard model={cards.bankroll} />
                </OverviewSection>
            );
        }
        case OverviewSectionId.CapUsage: {
            return (
                <OverviewSection section={section}>
                    <CapUsageCard model={cards.capUsage} />
                </OverviewSection>
            );
        }
        case OverviewSectionId.Costs: {
            return (
                <OverviewSection section={section}>
                    <CostCard model={cards.cost} />
                </OverviewSection>
            );
        }
        case OverviewSectionId.CushionBoard: {
            const { boards } = model;
            return (
                <OverviewSection section={section}>
                    {boards.kind === OverviewSectionStatus.Ready ? (
                        <CushionBoardCard model={boards.cushion} />
                    ) : (
                        <SectionGap
                            gap={boards}
                            loadingLabel="Loading the cushion board"
                        />
                    )}
                </OverviewSection>
            );
        }
        case OverviewSectionId.DataNotes: {
            return (
                <OverviewSection section={section}>
                    <NoticeList notices={cards.notices} />
                </OverviewSection>
            );
        }
        case OverviewSectionId.Diversification: {
            return (
                <OverviewSection section={section}>
                    <DiversificationCard model={cards.diversification} />
                </OverviewSection>
            );
        }
        case OverviewSectionId.EvSources: {
            const { evSources } = model;
            return (
                <OverviewSection section={section}>
                    {evSources.kind === OverviewSectionStatus.Ready ? (
                        <EvSourcesCard model={evSources.model} />
                    ) : (
                        <SectionGap
                            gap={evSources}
                            loadingLabel="Loading where EV comes from"
                        />
                    )}
                </OverviewSection>
            );
        }
        case OverviewSectionId.ExpectedNet: {
            return (
                <OverviewSection section={section}>
                    <ExpectedNetCard model={cards.expectedNet} />
                </OverviewSection>
            );
        }
        case OverviewSectionId.Exposure: {
            const { exposure } = model;
            return (
                <OverviewSection section={section}>
                    {exposure.kind === OverviewSectionStatus.Ready ? (
                        <ExposureCard model={exposure.model} />
                    ) : (
                        <SectionGap
                            gap={exposure}
                            loadingLabel="Loading the exposure"
                        />
                    )}
                </OverviewSection>
            );
        }
        case OverviewSectionId.FirmReturns: {
            return (
                <OverviewSection section={section}>
                    <FirmReturnsCard model={cards.firmReturns} />
                </OverviewSection>
            );
        }
        case OverviewSectionId.Firms: {
            return (
                <OverviewSection section={section}>
                    <FirmsTile load={load} userId={userId} />
                </OverviewSection>
            );
        }
        case OverviewSectionId.FreshStartProjection: {
            const { projection } = model;
            return (
                <OverviewSection section={section}>
                    {projection.kind === OverviewSectionStatus.Ready ? (
                        <ProjectionCard model={projection.model} />
                    ) : (
                        <SectionGap
                            gap={projection}
                            loadingLabel="Loading the fresh-start projection"
                        />
                    )}
                </OverviewSection>
            );
        }
        case OverviewSectionId.FundedPayouts: {
            return (
                <OverviewSection section={section}>
                    <FundedPayoutsCard model={cards.fundedPayouts} />
                </OverviewSection>
            );
        }
        case OverviewSectionId.Funnel: {
            return (
                <OverviewSection section={section}>
                    <FunnelCard model={cards.funnel} />
                </OverviewSection>
            );
        }
        case OverviewSectionId.Kpis: {
            return (
                <OverviewSection section={section}>
                    <KpiRow kpis={cards.kpis} />
                </OverviewSection>
            );
        }
        case OverviewSectionId.LiveProximity: {
            return (
                <OverviewSection section={section}>
                    <LiveProximityCard model={cards.liveProximity} />
                </OverviewSection>
            );
        }
        case OverviewSectionId.NextPayout: {
            const { nextPayout } = model;
            return (
                <OverviewSection section={section}>
                    {nextPayout.kind === OverviewSectionStatus.Ready ? (
                        <NextPayoutCard model={nextPayout.model} />
                    ) : (
                        <SectionGap
                            gap={nextPayout}
                            loadingLabel="Loading the figures from each account's own state"
                        />
                    )}
                </OverviewSection>
            );
        }
        case OverviewSectionId.Outcomes: {
            return (
                <OverviewSection section={section}>
                    <RealizedOutcomesCard model={cards.outcomes} />
                </OverviewSection>
            );
        }
        case OverviewSectionId.PayoutSizes: {
            return (
                <OverviewSection section={section}>
                    <PayoutSizesCard model={cards.payoutSizes} />
                </OverviewSection>
            );
        }
        case OverviewSectionId.PayoutTiming: {
            return (
                <OverviewSection section={section}>
                    <PayoutTimingCard model={cards.payoutTiming} />
                </OverviewSection>
            );
        }
        case OverviewSectionId.PooledCaps: {
            return (
                <OverviewSection section={section}>
                    <PooledCapCard model={cards.pooledCaps} />
                </OverviewSection>
            );
        }
        case OverviewSectionId.ProfitConcentration: {
            const { concentration } = model;
            return (
                <OverviewSection section={section}>
                    {concentration.kind === OverviewSectionStatus.Ready ? (
                        <ProfitConcentrationCard model={concentration.model} />
                    ) : (
                        <SectionGap
                            gap={concentration}
                            loadingLabel="Loading the profit concentration"
                        />
                    )}
                </OverviewSection>
            );
        }
        case OverviewSectionId.ReadinessBoard: {
            const { boards } = model;
            return (
                <OverviewSection section={section}>
                    {boards.kind === OverviewSectionStatus.Ready ? (
                        <ReadinessBoardCard model={boards.readiness} />
                    ) : (
                        <SectionGap
                            gap={boards}
                            loadingLabel="Loading the payout readiness board"
                        />
                    )}
                </OverviewSection>
            );
        }
        case OverviewSectionId.Repeatability: {
            return (
                <OverviewSection section={section}>
                    <RepeatabilityCard model={cards.repeatability} />
                </OverviewSection>
            );
        }
        case OverviewSectionId.Replacement: {
            return (
                <OverviewSection section={section}>
                    <ReplacementCard model={cards.replacement} />
                </OverviewSection>
            );
        }
        case OverviewSectionId.Setup: {
            return <SetupSection setup={model.setup} />;
        }
        case OverviewSectionId.Statement: {
            return (
                <OverviewSection section={section}>
                    <StatementCard model={cards.statement} />
                </OverviewSection>
            );
        }
        case OverviewSectionId.TiltVariance: {
            return (
                <OverviewSection section={section}>
                    <TiltVarianceCard model={cards.tiltVariance} />
                </OverviewSection>
            );
        }
        case OverviewSectionId.Timeline: {
            return (
                <OverviewSection section={section}>
                    <TimelineCard model={cards.timeline} />
                </OverviewSection>
            );
        }
        case OverviewSectionId.Violations: {
            return <ViolationsSummarySection violations={model.violations} />;
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

function SectionGap({
    gap,
    loadingLabel,
}: {
    readonly gap: OverviewSectionGap;
    readonly loadingLabel: string;
}) {
    switch (gap.kind) {
        case OverviewSectionStatus.Failed: {
            return <p className="text-sm text-destructive">{gap.message}</p>;
        }
        case OverviewSectionStatus.Pending: {
            return <SectionSkeleton label={loadingLabel} />;
        }
    }
}

function SectionSkeleton({ label }: { readonly label: string }) {
    return (
        <div aria-busy="true" aria-label={label} role="status">
            <Skeleton className="h-64 w-full" />
        </div>
    );
}

function SetupSection({ setup }: { readonly setup: OverviewSetup }) {
    switch (setup.kind) {
        case OverviewSectionStatus.Failed: {
            return (
                <OverviewSection section={OverviewSectionId.Setup}>
                    <p className="text-sm text-destructive">{setup.message}</p>
                </OverviewSection>
            );
        }
        case OverviewSectionStatus.Pending: {
            return null;
        }
        case OverviewSectionStatus.Ready: {
            return setup.model.isComplete ? null : (
                <OverviewSection section={OverviewSectionId.Setup}>
                    <SetupChecklistCard model={setup.model} />
                </OverviewSection>
            );
        }
    }
}

function useOverviewPortfolioData(): PortfolioLoad {
    const queries = usePortfolioQueries();
    const { data: firmStatements, error: firmStatementsError } =
        api.propAccounts.firmStatement.list.useQuery();
    const { data: rounds, error: roundsError } =
        api.propAccounts.round.list.useQuery();
    return useMemo(
        () =>
            portfolioLoad({
                ...queries,
                [PortfolioSource.FirmStatements]: {
                    data: firmStatements,
                    error: firmStatementsError,
                },
                [PortfolioSource.Rounds]: { data: rounds, error: roundsError },
            }),
        [firmStatements, firmStatementsError, queries, rounds, roundsError],
    );
}

function useStructuralSharing<Value>(value: Value): Value {
    const [shared, setShared] = useState(value);
    const next = useMemo(
        () => replaceEqualDeep(shared, value),
        [shared, value],
    );
    if (next !== shared) setShared(next);
    return next;
}

function ViolationsSummarySection({
    violations,
}: {
    readonly violations: OverviewViolations;
}) {
    return (
        <OverviewSection section={OverviewSectionId.Violations}>
            {violations.kind === OverviewSectionStatus.Ready ? (
                <ViolationsCard model={violations.model} />
            ) : (
                <SectionGap
                    gap={violations}
                    loadingLabel="Loading your rule violations"
                />
            )}
        </OverviewSection>
    );
}
