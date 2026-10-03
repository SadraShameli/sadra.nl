'use client';

import { NotebookPen, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { encodeState } from '~/app/(app)/prop-calculator/_components/urlState';
import { SampleBadge } from '~/app/(app)/prop-calculator/accounts/_components/overview/SampleBadge';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/Alert';
import { Badge, type BadgeProperties } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '~/components/ui/Card';
import { EmptyState } from '~/components/ui/EmptyState';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { Skeleton } from '~/components/ui/Skeleton';
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
import { routes } from '~/lib/site/routes';
import { api, type RouterOutputs } from '~/trpc/react';

type EdgeReport = RouterOutputs['propAccounts']['edge']['summary'];

const EARLIEST_DATE = `${String(MIN_ACCOUNT_DATE_YEAR)}-01-01`;
const LATEST_DATE = `${String(MAX_ACCOUNT_DATE_YEAR)}-12-31`;

const DRIFT_BADGE: Readonly<
    Record<
        EdgeDrift,
        { readonly label: string; readonly variant: BadgeProperties['variant'] }
    >
> = {
    [EdgeDrift.Above]: { label: 'Above the assumption', variant: 'success' },
    [EdgeDrift.Below]: { label: 'Below the assumption', variant: 'warning' },
    [EdgeDrift.NoTrades]: { label: 'No trades yet', variant: 'outline' },
    [EdgeDrift.TooFewTrades]: {
        label: 'Too few trades to tell',
        variant: 'outline',
    },
    [EdgeDrift.WithinNoise]: { label: 'Within noise', variant: 'secondary' },
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
            <h2 className="sr-only" id="prop-accounts-edge-heading">
                Journal edge
            </h2>
            <Alert>
                <NotebookPen />
                <AlertTitle>Display only</AlertTitle>
                <AlertDescription>
                    These numbers come from your trade journal and never change
                    your rulebook or the sizing advice. Drift is flagged only
                    when the journal sits more than {DRIFT_STANDARD_ERRORS}{' '}
                    standard errors from the assumption, with the standard error
                    taken at the assumed win rate and reward to risk, and only
                    once the journal holds enough trades to expect at least{' '}
                    {MIN_EXPECTED_WINS_AND_LOSSES} wins and{' '}
                    {MIN_EXPECTED_WINS_AND_LOSSES} losses at that win rate.
                </AlertDescription>
            </Alert>
            <div className="flex flex-wrap items-end gap-4">
                <EdgeDateField
                    id="prop-accounts-edge-from"
                    issue={rangeCheck.issues.get('from')}
                    label="From"
                    onChange={setFrom}
                    value={from}
                />
                <EdgeDateField
                    id="prop-accounts-edge-to"
                    issue={rangeCheck.issues.get('to')}
                    label="To"
                    onChange={setTo}
                    value={to}
                />
                {(from !== '' || to !== '') && (
                    <Button
                        onClick={() => {
                            setFrom('');
                            setTo('');
                        }}
                        variant="outline"
                    >
                        All journal days
                    </Button>
                )}
            </div>
            {rangeCheck.isValid && summaryQuery.isPending && (
                <Skeleton className="h-48 w-full" />
            )}
            {summaryQuery.isError && (
                <Alert variant="destructive">
                    <TriangleAlert />
                    <AlertTitle>
                        The journal edge could not be loaded
                    </AlertTitle>
                    <AlertDescription>
                        {summaryQuery.error.message}
                    </AlertDescription>
                </Alert>
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

function EdgeDateField({
    id,
    issue,
    label,
    onChange,
    value,
}: {
    readonly id: string;
    readonly issue: string | undefined;
    readonly label: string;
    readonly onChange: (value: string) => void;
    readonly value: string;
}) {
    const issueId = `${id}-issue`;
    return (
        <div className="flex flex-col gap-2">
            <Label htmlFor={id}>{label}</Label>
            <Input
                aria-describedby={issue === undefined ? undefined : issueId}
                aria-invalid={issue !== undefined}
                id={id}
                max={LATEST_DATE}
                min={EARLIEST_DATE}
                onChange={(event) => {
                    onChange(event.target.value);
                }}
                type="date"
                value={value}
            />
            {issue !== undefined && (
                <p
                    className="text-sm text-destructive first-letter:uppercase"
                    id={issueId}
                    role="alert"
                >
                    {issue}
                </p>
            )}
        </div>
    );
}

function EdgeMetricCard({
    description,
    format,
    formatError,
    intervalText,
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
    const badge = DRIFT_BADGE[metric.drift];
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex flex-wrap items-center justify-between gap-2">
                    {title}
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                </CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <dt className="text-muted-foreground">Your journal</dt>
                        <dd className="text-2xl font-semibold tabular-nums">
                            {metric.observed === null
                                ? 'n/a'
                                : format(metric.observed)}
                        </dd>
                        {metric.standardError !== null && (
                            <dd className="text-xs text-muted-foreground tabular-nums">
                                standard error{' '}
                                {formatError(metric.standardError)}
                            </dd>
                        )}
                        {intervalText !== undefined &&
                            intervalText !== null && (
                                <dd className="text-xs text-muted-foreground tabular-nums">
                                    {intervalText}
                                </dd>
                            )}
                    </div>
                    <div>
                        <dt className="text-muted-foreground">
                            Rulebook assumes
                        </dt>
                        <dd className="text-2xl font-semibold tabular-nums">
                            {format(metric.assumed)}
                        </dd>
                    </div>
                </dl>
            </CardContent>
        </Card>
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
        <Alert variant="warning">
            <TriangleAlert />
            <AlertTitle>Only the latest trades are counted</AlertTitle>
            <AlertDescription>
                More than {MAX_EDGE_TRADES} journal trades match, so only the
                latest {MAX_EDGE_TRADES} are counted. Narrow the range to
                include older ones.
            </AlertDescription>
        </Alert>
    );
    if (summary.sampleSize === 0) {
        return (
            <div className="flex flex-col gap-4">
                {truncationNotice}
                <EmptyState
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
                <EdgeMetricCard
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
                <EdgeMetricCard
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
): string {
    const query = encodeState({
        ...defaultCalculatorState(),
        rrRatio: rewardToRisk,
        winrate,
    }).toString();
    return `${routes.propCalculator.index}?${query}`;
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
