'use client';

import { NotebookPen } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { pageEncodeOptions } from '~/app/(app)/prop-calculator/_components/calculatorUrlSync';
import { encodeState } from '~/app/(app)/prop-calculator/_components/urlState';
import { SampleBadge } from '~/app/(app)/prop-calculator/accounts/_components/overview/SampleBadge';
import { QueryErrorNotice } from '~/app/(app)/prop-calculator/accounts/_components/QueryErrorNotice';
import { FilterToolbar } from '~/components/FilterToolbar';
import { InfoNote } from '~/components/InfoNote';
import { MissingValue } from '~/components/MissingValue';
import { CardSkeleton } from '~/components/PageSkeleton';
import { StatStrip } from '~/components/StatStrip';
import { StatusRow, StatusTone } from '~/components/StatusRow';
import { ToolPanel } from '~/components/ToolPanel';
import { ToolSectionHeading } from '~/components/ToolSectionHeading';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { ClearFiltersButton } from '~/components/ui/clear-filters-button';
import { EmptyStatePanel } from '~/components/ui/empty-state';
import { FieldError } from '~/components/ui/field';
import { FilterIsoDateRange } from '~/components/ui/filter-iso-date-range';
import { Skeleton } from '~/components/ui/skeleton';
import { formatPercent, formatR } from '~/lib/format';
import {
    MAX_ACCOUNT_DATE_YEAR,
    MIN_ACCOUNT_DATE_YEAR,
    sampleAdequacy,
    SampleKind,
} from '~/lib/prop-accounts';
import {
    checkEdgeRange,
    DRIFT_STANDARD_ERRORS,
    EdgeDrift,
    type EdgeMetric,
    type EdgeRange,
    MAX_EDGE_TRADES,
    type MeasuredRewardToRisk,
    MIN_EXPECTED_WINS_AND_LOSSES,
} from '~/lib/prop-accounts/edge';
import {
    DEFAULT_RULEBOOK,
    type SampleThresholds,
} from '~/lib/prop-calculator/advisor';
import { type WilsonInterval } from '~/lib/prop-calculator/stats';
import { CALCULATOR_SCALAR_BOUNDS } from '~/lib/schemas/url';
import { type PathWithQuery, routes } from '~/lib/site/routes';
import { api, type RouterOutputs } from '~/trpc/react';

type EdgeReport = RouterOutputs['propAccounts']['edge']['summary'];

const NO_OBSERVED_REASON =
    'No journal trade in this range has a recorded result for this figure.';

const EARLIEST_DATE = `${String(MIN_ACCOUNT_DATE_YEAR)}-01-01`;
const LATEST_DATE = `${String(MAX_ACCOUNT_DATE_YEAR)}-12-31`;

const DRIFT_LABEL: Readonly<Record<EdgeDrift, string>> = {
    [EdgeDrift.Above]: 'Above the assumption',
    [EdgeDrift.Below]: 'Below the assumption',
    [EdgeDrift.NoTrades]: 'No trades yet',
    [EdgeDrift.TooFewTrades]: 'Too few trades to tell',
    [EdgeDrift.WithinNoise]: 'Within noise',
};

export function EdgeView() {
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const range = edgeRange(from, to);
    const rangeCheck = checkEdgeRange(range);
    const summaryQuery = api.propAccounts.edge.summary.useQuery(range, {
        enabled: rangeCheck.isValid,
    });
    const rulebookQuery = api.propAccounts.rulebook.get.useQuery();
    const sampleThresholds =
        rulebookQuery.data?.samples ?? DEFAULT_RULEBOOK.samples;

    return (
        <section
            aria-labelledby="prop-accounts-edge-heading"
            className="app-prop-accounts__edge-view flex flex-col gap-6"
        >
            <ToolSectionHeading
                className="sr-only"
                id="prop-accounts-edge-heading"
            >
                Journal edge
            </ToolSectionHeading>
            <div className="flex flex-col gap-2">
                <FilterToolbar label="Journal filters">
                    <FilterIsoDateRange
                        label="Journal days"
                        max={LATEST_DATE}
                        min={EARLIEST_DATE}
                        onChange={(next) => {
                            setFrom(next.from ?? '');
                            setTo(next.to ?? '');
                        }}
                        placeholder="All journal days"
                        value={{
                            from: from === '' ? null : from,
                            to: to === '' ? null : to,
                        }}
                    />
                    <ClearFiltersButton
                        active={from !== '' || to !== ''}
                        onReset={() => {
                            setFrom('');
                            setTo('');
                        }}
                    />
                </FilterToolbar>
                <InfoNote
                    info={
                        <>
                            <p>
                                Drift is flagged only when the journal sits more
                                than {DRIFT_STANDARD_ERRORS} standard errors
                                from the assumption, with the standard error
                                taken at the assumed win rate and reward to
                                risk.
                            </p>
                            <p>
                                It waits until the journal holds enough trades
                                to expect at least{' '}
                                {MIN_EXPECTED_WINS_AND_LOSSES} wins and{' '}
                                {MIN_EXPECTED_WINS_AND_LOSSES} losses at that
                                win rate.
                            </p>
                        </>
                    }
                    infoTitle="How drift is flagged"
                >
                    Read only: journal numbers never change your rulebook or the
                    sizing advice.
                </InfoNote>
                {[...rangeCheck.issues].map(([field, issue]) => (
                    <FieldError
                        className="text-xs first-letter:uppercase"
                        key={field}
                    >
                        {issue}
                    </FieldError>
                ))}
            </div>
            {rangeCheck.isValid && summaryQuery.isPending && (
                <div
                    aria-busy="true"
                    aria-label="Loading your journal edge"
                    className="flex flex-col gap-6"
                    role="status"
                >
                    <Skeleton className="h-24 w-full rounded-lg" />
                    <CardSkeleton rows={2} />
                    <CardSkeleton rows={2} />
                </div>
            )}
            {summaryQuery.isError && (
                <QueryErrorNotice
                    message={summaryQuery.error.message}
                    title="The journal edge could not be loaded"
                />
            )}
            {summaryQuery.isSuccess && (
                <EdgeResult
                    report={summaryQuery.data}
                    sampleThresholds={sampleThresholds}
                />
            )}
        </section>
    );
}

function EdgeMetricPanel({
    description,
    format,
    formatError,
    intervalText = null,
    metric,
    title,
}: {
    readonly description: string;
    readonly format: (value: number) => string;
    readonly formatError: (value: number) => string;
    readonly intervalText?: null | string;
    readonly metric: EdgeMetric;
    readonly title: string;
}) {
    const captionLines = [
        metric.standardError === null
            ? null
            : `standard error ${formatError(metric.standardError)}`,
        intervalText,
    ].filter((line): line is string => line !== null);
    return (
        <ToolPanel
            actions={<Badge>{DRIFT_LABEL[metric.drift]}</Badge>}
            description={description}
            title={title}
            titleAs="h3"
        >
            <StatStrip
                items={[
                    {
                        caption:
                            captionLines.length === 0
                                ? undefined
                                : captionLines.map((line) => (
                                      <span className="block" key={line}>
                                          {line}
                                      </span>
                                  )),
                        id: 'observed',
                        label: 'Your journal',
                        value:
                            metric.observed === null ? (
                                <MissingValue reason={NO_OBSERVED_REASON} />
                            ) : (
                                format(metric.observed)
                            ),
                    },
                    {
                        id: 'assumed',
                        label: 'Rulebook assumes',
                        value: format(metric.assumed),
                    },
                ]}
            />
        </ToolPanel>
    );
}

function edgeRange(from: string, to: string): EdgeRange {
    return {
        ...(from !== '' && { from }),
        ...(to !== '' && { to }),
    };
}

function EdgeResult({
    report,
    sampleThresholds,
}: {
    readonly report: EdgeReport;
    readonly sampleThresholds: SampleThresholds;
}) {
    const { summary, truncated } = report;
    const measuredRewardToRisk = measuredRewardToRiskWithinCalculatorBounds(
        summary.measuredRewardToRisk,
    );
    const edgeRewardToRisk =
        measuredRewardToRisk?.value ?? summary.rewardToRisk;
    const sampleLevel = sampleAdequacy(
        SampleKind.Trades,
        summary.sampleSize,
        sampleThresholds,
    );
    const truncationNotice = truncated && (
        <StatusRow
            detail={`More than ${String(MAX_EDGE_TRADES)} journal trades match, so only the latest ${String(MAX_EDGE_TRADES)} are counted. Narrow the range to include older ones.`}
            title="Only the latest trades are counted"
            tone={StatusTone.Warn}
        />
    );
    if (summary.sampleSize === 0) {
        return (
            <div className="flex flex-col gap-4">
                {truncationNotice}
                <EmptyStatePanel
                    action={
                        <Button asChild variant="outline">
                            <Link href={routes.tradeChecklist.journal}>
                                Open the trade journal
                            </Link>
                        </Button>
                    }
                    description="No journal trade in this range has a recorded win, loss or breakeven with an R result."
                    icon={NotebookPen}
                    title="No trades to compare"
                />
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-4">
            {truncationNotice}
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <p>
                    Based on{' '}
                    <span className="font-semibold text-foreground tabular-nums">
                        n = {summary.sampleSize}
                    </span>{' '}
                    journal {summary.sampleSize === 1 ? 'trade' : 'trades'} with
                    a recorded result; breakevens count as trades that did not
                    win.
                </p>
                <SampleBadge level={sampleLevel} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                <EdgeMetricPanel
                    description="Share of counted trades that were wins."
                    format={(value) => formatPercent(value)}
                    formatError={(value) => formatPercent(value)}
                    intervalText={winRateIntervalText(
                        summary.winRateInterval,
                        summary.sampleSize,
                    )}
                    metric={summary.winRate}
                    title="Win rate"
                />
                <EdgeMetricPanel
                    description={expectancyDescription(summary.rewardToRisk)}
                    format={(value) => formatR(value)}
                    formatError={(value) => `${value.toFixed(2)}R`}
                    metric={summary.expectancyR}
                    title="Expectancy"
                />
            </div>
            {summary.winRate.observed === null ? null : (
                <div className="flex flex-col gap-1">
                    <Button asChild className="self-start" variant="outline">
                        <Link
                            href={measuredEdgeCalculatorHref(
                                summary.winRate.observed,
                                edgeRewardToRisk,
                            )}
                        >
                            Try my measured win rate in the calculator
                        </Link>
                    </Button>
                    <p className="text-xs text-muted-foreground">
                        {measuredEdgeCaption(
                            summary.rewardToRisk,
                            measuredRewardToRisk,
                        )}
                    </p>
                </div>
            )}
        </div>
    );
}

function expectancyDescription(rewardToRisk: number): string {
    return `Average R per counted trade; the rulebook's 1:${rewardToRisk} at its win rate sets the assumption.`;
}

function measuredEdgeCalculatorHref(
    winrate: number,
    rewardToRisk: number,
): PathWithQuery<typeof routes.propCalculator.index> {
    const hub = routes.propCalculator.index;
    const query = encodeState(
        { ...defaultCalculatorState(), rrRatio: rewardToRisk, winrate },
        pageEncodeOptions(hub),
    ).toString();
    return `${hub}?${query}` as const;
}

function measuredEdgeCaption(
    rewardToRisk: number,
    measuredRewardToRisk: MeasuredRewardToRisk | null,
): string {
    return measuredRewardToRisk === null
        ? `Carries over your measured win rate. The 1:${rewardToRisk} reward:risk is still the rulebook's assumption, not measured from your trades.`
        : `Carries over your measured win rate and your measured 1:${measuredRewardToRisk.value.toFixed(2)} reward:risk from n = ${measuredRewardToRisk.sampleSize} wins and losses.`;
}

function measuredRewardToRiskWithinCalculatorBounds(
    measuredRewardToRisk: MeasuredRewardToRisk | null,
): MeasuredRewardToRisk | null {
    if (measuredRewardToRisk === null) return null;
    const { max, min } = CALCULATOR_SCALAR_BOUNDS.rr;
    return measuredRewardToRisk.value >= min &&
        measuredRewardToRisk.value <= max
        ? measuredRewardToRisk
        : null;
}

function winRateIntervalText(
    interval: null | WilsonInterval,
    sampleSize: number,
): null | string {
    return interval === null
        ? null
        : `95% CI ${formatPercent(interval.lower)} to ${formatPercent(interval.upper)}, n = ${String(sampleSize)}`;
}
