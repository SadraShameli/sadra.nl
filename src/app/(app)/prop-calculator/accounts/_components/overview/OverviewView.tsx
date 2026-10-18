'use client';

import { replaceEqualDeep } from '@tanstack/react-query';
import Link from 'next/link';
import { memo, type ReactNode, useMemo, useState } from 'react';

import { HEADER_SCROLL_MARGIN } from '~/app/(app)/_components/headerHeight';
import { useTodayIsoDate } from '~/app/(app)/prop-calculator/_components/useTodayIsoDate';
import { OverviewSkeleton } from '~/app/(app)/prop-calculator/accounts/_components/AccountsSkeleton';
import { AccountsTableWithValues } from '~/app/(app)/prop-calculator/accounts/_components/AccountsTable';
import {
    ErrorNoticeTitle,
    QueryErrorNotice,
} from '~/app/(app)/prop-calculator/accounts/_components/QueryErrorNotice';
import { useAccountValuesWithEngine } from '~/app/(app)/prop-calculator/accounts/_components/useAccountValues';
import { InfoNote } from '~/components/InfoNote';
import { type PageTab, UrlPageTabs } from '~/components/PageTabs';
import { StatusRow, StatusTone } from '~/components/StatusRow';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import {
    isInvalidStoredRecord,
    PropRecord,
} from '~/lib/schemas/propAccountOutputs';
import { routes } from '~/lib/site/routes';
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
import { OverviewPanel } from './OverviewPanel';
import {
    OVERVIEW_DEFAULT_TAB,
    OVERVIEW_TAB_LABEL,
    OVERVIEW_TAB_PARAMETER,
    OVERVIEW_TABS,
    overviewSectionAnchor,
    OverviewSectionId,
    type OverviewTab,
    overviewTabSections,
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

const LEDGER_FREE_SECTIONS = [
    OverviewSectionId.Accounts,
    OverviewSectionId.Alerts,
    OverviewSectionId.Violations,
] as const;

type LedgerFreeSectionId = (typeof LEDGER_FREE_SECTIONS)[number];

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
            <LoadFailures issues={load.failures} />
            <StaleLoads issues={load.stale} />
            {externalFirmsQuery.isError && (
                <QueryErrorNotice
                    consequence="Accounts at a firm you added show it as an unlisted firm in the cards below until your firms load."
                    message={externalFirmsQuery.error.message}
                    title={ErrorNoticeTitle.Firms}
                />
            )}
            {load.accounts.status === OverviewSectionStatus.Pending && (
                <OverviewSkeleton />
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
        <OverviewPanel section={OverviewSectionId.Alerts}>
            {alerts.kind === OverviewSectionStatus.Ready ? (
                <>
                    {alerts.accountStatesCaveat !== null && (
                        <InfoNote>{alerts.accountStatesCaveat}</InfoNote>
                    )}
                    <AlertsCenter alerts={alerts.alerts} />
                </>
            ) : (
                <SectionGap gap={alerts} loadingLabel="Loading the alerts" />
            )}
        </OverviewPanel>
    );
}

function isLedgerFreeSection(
    section: OverviewSectionId,
): section is LedgerFreeSectionId {
    const ledgerFreeSections: readonly OverviewSectionId[] =
        LEDGER_FREE_SECTIONS;
    return ledgerFreeSections.includes(section);
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

function LedgerFreeSection({
    accountsTable,
    model,
    section,
}: {
    readonly accountsTable: ReactNode;
    readonly model: OverviewModel;
    readonly section: LedgerFreeSectionId;
}) {
    switch (section) {
        case OverviewSectionId.Accounts: {
            return accountsTable;
        }
        case OverviewSectionId.Alerts: {
            return <AlertsSection alerts={model.alerts} />;
        }
        case OverviewSectionId.Violations: {
            return <ViolationsSummarySection violations={model.violations} />;
        }
    }
}

function LedgerGapSections({
    accountsTable,
    children,
    model,
    tab,
}: {
    readonly accountsTable: ReactNode;
    readonly children: ReactNode;
    readonly model: OverviewModel;
    readonly tab: OverviewTab;
}) {
    return (
        <>
            {overviewTabSections(tab)
                .filter((section) => isLedgerFreeSection(section))
                .map((section) => (
                    <LedgerFreeSection
                        accountsTable={accountsTable}
                        key={section}
                        model={model}
                        section={section}
                    />
                ))}
            {children}
        </>
    );
}

function LoadFailures({
    issues,
}: {
    readonly issues: readonly PortfolioLoadIssue[];
}) {
    if (issues.length === 0) return null;
    return (
        <div className="flex flex-col gap-3">
            {issues.map((issue) => (
                <QueryErrorNotice
                    actions={
                        issue.source === PortfolioSource.Rulebook ? (
                            <div className="mt-2">
                                <RulebookRepairLink />
                            </div>
                        ) : undefined
                    }
                    key={issue.source}
                    message={issue.message}
                    title={issue.title}
                />
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
    const tabs: readonly PageTab<OverviewTab>[] = OVERVIEW_TABS.map((tab) => ({
        content: (
            <div className="flex flex-col gap-8">
                <OverviewTabSections
                    accountsTable={accountsTable}
                    load={load}
                    model={model}
                    tab={tab}
                    userId={userId}
                />
            </div>
        ),
        label: OVERVIEW_TAB_LABEL[tab],
        value: tab,
    }));
    return (
        <UrlPageTabs
            defaultValue={OVERVIEW_DEFAULT_TAB}
            searchParameter={OVERVIEW_TAB_PARAMETER}
            tabs={tabs}
        />
    );
});

function OverviewTabSections({
    accountsTable,
    load,
    model,
    tab,
    userId,
}: {
    readonly accountsTable: ReactNode;
    readonly load: PortfolioLoad;
    readonly model: OverviewModel;
    readonly tab: OverviewTab;
    readonly userId: string;
}) {
    const { ledger } = model;
    switch (ledger.kind) {
        case OverviewSectionStatus.Failed: {
            return (
                <LedgerGapSections
                    accountsTable={accountsTable}
                    model={model}
                    tab={tab}
                >
                    <QueryErrorNotice
                        message={ledger.message}
                        title="The ledger cards are not shown"
                    />
                </LedgerGapSections>
            );
        }
        case OverviewSectionStatus.Pending: {
            return (
                <LedgerGapSections
                    accountsTable={accountsTable}
                    model={model}
                    tab={tab}
                >
                    <SectionSkeleton label="Loading the ledger cards" />
                </LedgerGapSections>
            );
        }
        case OverviewSectionStatus.Ready: {
            return (
                <>
                    {overviewTabSections(tab)
                        .filter(
                            (section) =>
                                section !== OverviewSectionId.Setup ||
                                isSetupShown(model.setup),
                        )
                        .map((section) => (
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
        case OverviewSectionId.Accounts:
        case OverviewSectionId.Alerts:
        case OverviewSectionId.Violations: {
            return (
                <LedgerFreeSection
                    accountsTable={accountsTable}
                    model={model}
                    section={section}
                />
            );
        }
        case OverviewSectionId.AttemptEconomics: {
            return <AttemptEconomicsCard model={cards.attemptEconomics} />;
        }
        case OverviewSectionId.AttemptThroughput: {
            return <AttemptThroughputCard model={cards.attemptThroughput} />;
        }
        case OverviewSectionId.Bankroll: {
            return <BankrollCard model={cards.bankroll} />;
        }
        case OverviewSectionId.CapUsage: {
            return <CapUsageCard model={cards.capUsage} />;
        }
        case OverviewSectionId.Costs: {
            return <CostCard model={cards.cost} />;
        }
        case OverviewSectionId.CushionBoard: {
            const { boards } = model;
            return boards.kind === OverviewSectionStatus.Ready ? (
                <CushionBoardCard model={boards.cushion} />
            ) : (
                <SectionGapPanel
                    gap={boards}
                    loadingLabel="Loading the cushion board"
                    section={section}
                />
            );
        }
        case OverviewSectionId.DataNotes: {
            return (
                <OverviewPanel section={section}>
                    <NoticeList notices={cards.notices} />
                </OverviewPanel>
            );
        }
        case OverviewSectionId.Diversification: {
            return <DiversificationCard model={cards.diversification} />;
        }
        case OverviewSectionId.EvSources: {
            const { evSources } = model;
            return evSources.kind === OverviewSectionStatus.Ready ? (
                <EvSourcesCard model={evSources.model} />
            ) : (
                <SectionGapPanel
                    gap={evSources}
                    loadingLabel="Loading where EV comes from"
                    section={section}
                />
            );
        }
        case OverviewSectionId.ExpectedNet: {
            return <ExpectedNetCard model={cards.expectedNet} />;
        }
        case OverviewSectionId.Exposure: {
            const { exposure } = model;
            return exposure.kind === OverviewSectionStatus.Ready ? (
                <ExposureCard model={exposure.model} />
            ) : (
                <SectionGapPanel
                    gap={exposure}
                    loadingLabel="Loading the exposure"
                    section={section}
                />
            );
        }
        case OverviewSectionId.FirmReturns: {
            return <FirmReturnsCard model={cards.firmReturns} />;
        }
        case OverviewSectionId.Firms: {
            return (
                <OverviewPanel section={section}>
                    <FirmsTile load={load} userId={userId} />
                </OverviewPanel>
            );
        }
        case OverviewSectionId.FreshStartProjection: {
            const { projection } = model;
            return projection.kind === OverviewSectionStatus.Ready ? (
                <ProjectionCard model={projection.model} />
            ) : (
                <SectionGapPanel
                    gap={projection}
                    loadingLabel="Loading the fresh-start projection"
                    section={section}
                />
            );
        }
        case OverviewSectionId.FundedPayouts: {
            return <FundedPayoutsCard model={cards.fundedPayouts} />;
        }
        case OverviewSectionId.Funnel: {
            return <FunnelCard model={cards.funnel} />;
        }
        case OverviewSectionId.Kpis: {
            return (
                <OverviewPanel section={section}>
                    <KpiRow kpis={cards.kpis} />
                </OverviewPanel>
            );
        }
        case OverviewSectionId.LiveProximity: {
            return <LiveProximityCard model={cards.liveProximity} />;
        }
        case OverviewSectionId.NextPayout: {
            const { nextPayout } = model;
            return nextPayout.kind === OverviewSectionStatus.Ready ? (
                <NextPayoutCard model={nextPayout.model} />
            ) : (
                <SectionGapPanel
                    gap={nextPayout}
                    loadingLabel="Loading the figures from each account's own state"
                    section={section}
                />
            );
        }
        case OverviewSectionId.Outcomes: {
            return <RealizedOutcomesCard model={cards.outcomes} />;
        }
        case OverviewSectionId.PayoutSizes: {
            return <PayoutSizesCard model={cards.payoutSizes} />;
        }
        case OverviewSectionId.PayoutTiming: {
            return <PayoutTimingCard model={cards.payoutTiming} />;
        }
        case OverviewSectionId.PooledCaps: {
            return <PooledCapCard model={cards.pooledCaps} />;
        }
        case OverviewSectionId.ProfitConcentration: {
            const { concentration } = model;
            return concentration.kind === OverviewSectionStatus.Ready ? (
                <ProfitConcentrationCard model={concentration.model} />
            ) : (
                <SectionGapPanel
                    gap={concentration}
                    loadingLabel="Loading the profit concentration"
                    section={section}
                />
            );
        }
        case OverviewSectionId.ReadinessBoard: {
            const { boards } = model;
            return boards.kind === OverviewSectionStatus.Ready ? (
                <ReadinessBoardCard model={boards.readiness} />
            ) : (
                <SectionGapPanel
                    gap={boards}
                    loadingLabel="Loading the payout readiness board"
                    section={section}
                />
            );
        }
        case OverviewSectionId.Repeatability: {
            return <RepeatabilityCard model={cards.repeatability} />;
        }
        case OverviewSectionId.Replacement: {
            return <ReplacementCard model={cards.replacement} />;
        }
        case OverviewSectionId.Setup: {
            return <SetupSection setup={model.setup} />;
        }
        case OverviewSectionId.Statement: {
            return <StatementCard model={cards.statement} />;
        }
        case OverviewSectionId.TiltVariance: {
            return <TiltVarianceCard model={cards.tiltVariance} />;
        }
        case OverviewSectionId.Timeline: {
            return <TimelineCard model={cards.timeline} />;
        }
    }
}

function RulebookRepairLink() {
    const { error } = api.propAccounts.rulebook.get.useQuery();
    if (!isInvalidStoredRecord(error, PropRecord.Rulebook)) return null;
    return (
        <Button asChild size="sm" variant="outline">
            <Link href={routes.propCalculator.accounts.rulebook}>
                Repair the rulebook
            </Link>
        </Button>
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
            return <QueryErrorNotice message={gap.message} />;
        }
        case OverviewSectionStatus.Pending: {
            return <SectionSkeleton label={loadingLabel} />;
        }
    }
}

function SectionGapPanel({
    gap,
    loadingLabel,
    section,
}: {
    readonly gap: OverviewSectionGap;
    readonly loadingLabel: string;
    readonly section: OverviewSectionId;
}) {
    return (
        <OverviewPanel section={section}>
            <SectionGap gap={gap} loadingLabel={loadingLabel} />
        </OverviewPanel>
    );
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
                <OverviewPanel section={OverviewSectionId.Setup}>
                    <QueryErrorNotice message={setup.message} />
                </OverviewPanel>
            );
        }
        case OverviewSectionStatus.Pending: {
            return null;
        }
        case OverviewSectionStatus.Ready: {
            return setup.model.isComplete ? null : (
                <SetupChecklistCard model={setup.model} />
            );
        }
    }
}

function StaleLoads({
    issues,
}: {
    readonly issues: readonly PortfolioLoadIssue[];
}) {
    if (issues.length === 0) return null;
    return (
        <div className="flex flex-col gap-3">
            {issues.map((issue) => (
                <StatusRow
                    actions={
                        issue.source === PortfolioSource.Rulebook ? (
                            <RulebookRepairLink />
                        ) : undefined
                    }
                    detail={issue.message}
                    key={issue.source}
                    title={issue.title}
                    tone={StatusTone.Warn}
                />
            ))}
        </div>
    );
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
    return violations.kind === OverviewSectionStatus.Ready ? (
        <ViolationsCard model={violations.model} />
    ) : (
        <SectionGapPanel
            gap={violations}
            loadingLabel="Loading your rule violations"
            section={OverviewSectionId.Violations}
        />
    );
}
