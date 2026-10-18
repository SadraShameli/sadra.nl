'use client';

import { Pin, PinOff } from 'lucide-react';
import { type ReactNode } from 'react';

import { PanelSubheading } from '~/components/PanelSubheading';
import { StatStrip, type StatStripItem } from '~/components/StatStrip';
import { ToolPanel } from '~/components/ToolPanel';
import { Card, CardContent } from '~/components/ui/card';
import { Toggle } from '~/components/ui/toggle';
import {
    formatCompactCurrency,
    formatCount,
    formatCurrency,
    formatDays,
    formatDelta,
    formatFiniteCurrency,
    formatOptionalPercent,
    formatPercent,
    formatStreak,
} from '~/lib/format';
import { type Plan, type SimOutputs } from '~/lib/prop-calculator';

import AccountsPassedDistributionChart from './AccountsPassedDistributionChart';
import AttemptEconomicsCard from './economics/AttemptEconomicsCard';
import { attemptEconomicsCardModel } from './economics/attemptEconomicsModel';
import { describeFirstPayoutGate } from './firstPayoutGate';
import { kpiDescriptions } from './kpiDescriptions';
import {
    NO_COST_ROI_REASON,
    NO_PASS_DAYS_REASON,
    NO_PASS_REASON,
    NO_PAYOUT_REASON,
} from './missingReasons';
import { ValueOrMissing } from './ValueOrMissing';

interface CostBreakdownBodyProperties {
    plan: Plan;
    result: SimOutputs;
}

interface DeltaChip {
    positive: boolean | null;
    text: string;
}

interface KpiItemProperties {
    delta?: DeltaChip | null;
    id: string;
    info: ReactNode;
    label: string;
    sub: string;
    value: ReactNode;
}

interface ResultsPanelProperties {
    fundedHorizonDays?: number;
    isPending: boolean;
    onPin: () => void;
    onUnpin: () => void;
    pinned: null | SimOutputs;
    plan: Plan;
    result: SimOutputs;
}

export default function ResultsPanel({
    fundedHorizonDays,
    isPending,
    onPin,
    onUnpin,
    pinned,
    plan,
    result,
}: ResultsPanelProperties) {
    const attemptEconomics =
        fundedHorizonDays === undefined
            ? null
            : attemptEconomicsCardModel(result, fundedHorizonDays);
    const dEvalPass = pinned
        ? formatDelta(
              result.evalPassProbability,
              pinned.evalPassProbability,
              'percent',
          )
        : null;
    const dFundedSurvival = pinned
        ? formatDelta(
              result.fundedSurvivalProbability,
              pinned.fundedSurvivalProbability,
              'percent',
          )
        : null;
    const dCost = pinned
        ? formatDelta(
              result.expectedTotalCost,
              pinned.expectedTotalCost,
              'currency',
          )
        : null;
    const dDays = pinned
        ? formatDelta(
              result.expectedDaysToPass,
              pinned.expectedDaysToPass,
              'days',
          )
        : null;
    const dNet = pinned
        ? formatDelta(
              result.expectedMonthlyNet,
              pinned.expectedMonthlyNet,
              'currency',
          )
        : null;
    const dCostInverted = dCost
        ? {
              positive: dCost.positive === null ? null : !dCost.positive,
              text: dCost.text,
          }
        : null;
    const dDaysInverted = dDays
        ? {
              positive: dDays.positive === null ? null : !dDays.positive,
              text: dDays.text,
          }
        : null;
    const isShowCycleEconomics = result.expectedAttempts > 1.01;

    return (
        <ToolPanel
            actions={
                <Toggle
                    className="h-7 gap-1.5 px-2 text-xs"
                    onPressedChange={(isPressed) =>
                        isPressed ? onPin() : onUnpin()
                    }
                    pressed={pinned !== null}
                    size="sm"
                    variant="outline"
                >
                    {pinned ? (
                        <>
                            <PinOff className="size-3.5" />
                            Unpin
                        </>
                    ) : (
                        <>
                            <Pin className="size-3.5" />
                            Pin scenario
                        </>
                    )}
                </Toggle>
            }
            className="app-prop-calculator__results"
            data-state={isPending ? 'pending' : 'idle'}
            description={
                pinned
                    ? `Pinned: ${formatCount(pinned.accountSize)} · comparing live vs pinned`
                    : 'Pin a scenario to compare deltas'
            }
            isComputing={isPending}
            title="Results"
            titleAs="h3"
        >
            <div>
                <PanelSubheading as="h4" className="mb-2">
                    Outcome
                </PanelSubheading>
                <StatStrip
                    items={[
                        kpiItem({
                            delta: dEvalPass,
                            id: 'eval-pass',
                            info: (
                                <>
                                    <p>{kpiDescriptions.evalPass}</p>
                                    <p className="mt-2 font-mono text-xs">
                                        {formatPercent(
                                            result.evalPassProbability,
                                        )}{' '}
                                        eval pass ·{' '}
                                        {formatPercent(
                                            result.fundedSurvivalProbability,
                                        )}{' '}
                                        funded survive ·{' '}
                                        {formatPercent(
                                            result.fundedBustProbability,
                                        )}{' '}
                                        busted funded ·{' '}
                                        {formatPercent(result.bustProbability)}{' '}
                                        bust eval ·{' '}
                                        {formatPercent(
                                            result.timeoutProbability,
                                        )}{' '}
                                        timeout
                                    </p>
                                </>
                            ),
                            label: 'Eval pass',
                            sub: `${formatPercent(result.bustProbability)} bust · ${formatPercent(result.timeoutProbability)} timeout`,
                            value: formatPercent(result.evalPassProbability),
                        }),
                        kpiItem({
                            delta: dFundedSurvival,
                            id: 'funded-survive',
                            info: (
                                <>
                                    <p>{kpiDescriptions.fundedSurvival}</p>
                                    <p className="mt-2 font-mono text-xs">
                                        {formatPercent(
                                            result.fundedSurvivalProbability,
                                        )}{' '}
                                        survived ·{' '}
                                        {formatPercent(
                                            result.fundedBustProbability,
                                        )}{' '}
                                        busted after funding
                                    </p>
                                </>
                            ),
                            label: 'Funded survive',
                            sub: `${formatPercent(result.fundedBustProbability)} busted after funding`,
                            value: formatPercent(
                                result.fundedSurvivalProbability,
                            ),
                        }),
                        kpiItem({
                            delta: dDaysInverted,
                            id: 'avg-days-to-pass',
                            info: (
                                <>
                                    <p>{kpiDescriptions.avgDaysToPass}</p>
                                    <p className="mt-2 font-mono text-xs">
                                        P25{' '}
                                        <ValueOrMissing
                                            value={formatDays(
                                                result.daysToPassP25,
                                            )}
                                        />{' '}
                                        · P50{' '}
                                        <ValueOrMissing
                                            value={formatDays(
                                                result.daysToPassP50,
                                            )}
                                        />{' '}
                                        · P75{' '}
                                        <ValueOrMissing
                                            value={formatDays(
                                                result.daysToPassP75,
                                            )}
                                        />
                                    </p>
                                </>
                            ),
                            label: 'Avg days to pass',
                            sub:
                                plan.minTradingDays === 0
                                    ? 'no minimum days'
                                    : `min ${plan.minTradingDays} required`,
                            value: (
                                <ValueOrMissing
                                    reason={NO_PASS_DAYS_REASON}
                                    value={formatDays(
                                        result.expectedDaysToPass,
                                    )}
                                />
                            ),
                        }),
                        kpiItem({
                            delta: dCostInverted,
                            id: 'total-cost',
                            info: (
                                <CostBreakdownBody
                                    plan={plan}
                                    result={result}
                                />
                            ),
                            label: 'Total cost (avg)',
                            sub: `P90 budget ${formatCurrency(result.expectedSpendP90)}`,
                            value: formatCurrency(result.expectedTotalCost),
                        }),
                        kpiItem({
                            id: 'first-payout',
                            info: <p>{kpiDescriptions.firstPayout}</p>,
                            label: 'First payout',
                            sub: describeFirstPayoutGate(plan),
                            value: (
                                <ValueOrMissing
                                    reason={NO_PAYOUT_REASON}
                                    value={
                                        result.expectedFirstPayoutDay > 0
                                            ? `day ${result.expectedFirstPayoutDay.toFixed(0)}`
                                            : null
                                    }
                                />
                            ),
                        }),
                        kpiItem({
                            delta: dNet,
                            id: 'monthly-net',
                            info: (
                                <>
                                    <p>{kpiDescriptions.monthlyNet}</p>
                                    <p className="mt-2 font-mono text-xs">
                                        {result.copyAccounts > 1
                                            ? `Total over ${result.copyAccounts} copy-traded accounts: gross`
                                            : 'Gross'}{' '}
                                        {formatCurrency(
                                            result.expectedGrossPayout,
                                        )}{' '}
                                        − cost{' '}
                                        {formatCurrency(
                                            result.expectedTotalCost,
                                        )}{' '}
                                        = net{' '}
                                        {formatCurrency(result.expectedNet)}
                                    </p>
                                </>
                            ),
                            label: 'Monthly net (est)',
                            sub: `payout ${formatCurrency(result.expectedGrossPayout)} avg`,
                            value: formatCurrency(result.expectedMonthlyNet),
                        }),
                        ...(attemptEconomics
                            ? [
                                  kpiItem({
                                      id: 'ev-per-attempt',
                                      info: (
                                          <>
                                              <p>
                                                  {kpiDescriptions.evPerAttempt}
                                              </p>
                                              {attemptEconomics.formula && (
                                                  <p className="mt-2 font-mono text-xs">
                                                      {attemptEconomics.formula}
                                                  </p>
                                              )}
                                          </>
                                      ),
                                      label: 'EV per attempt',
                                      sub: 'per attempt, ignores time; not the ranking objective',
                                      value: (
                                          <ValueOrMissing
                                              value={
                                                  attemptEconomics.economics
                                                      ? formatCurrency(
                                                            attemptEconomics
                                                                .economics
                                                                .expectedNetPerAttempt
                                                                .value,
                                                        )
                                                      : null
                                              }
                                          />
                                      ),
                                  }),
                              ]
                            : []),
                    ]}
                />
            </div>

            <div>
                <PanelSubheading as="h4" className="mb-2">
                    Trading edge
                </PanelSubheading>
                <StatStrip
                    items={[
                        kpiItem({
                            id: 'max-losing-streak',
                            info: (
                                <>
                                    <p>{kpiDescriptions.maxLosingStreak}</p>
                                    <p className="mt-2 font-mono text-xs">
                                        P50{' '}
                                        {formatStreak(
                                            result.maxLosingStreakP50,
                                        )}{' '}
                                        · P95{' '}
                                        {formatStreak(
                                            result.maxLosingStreakP95,
                                        )}
                                    </p>
                                </>
                            ),
                            label: 'Max losing streak',
                            sub: 'P50 / P95',
                            value: `${formatStreak(result.maxLosingStreakP50)} / ${formatStreak(result.maxLosingStreakP95)}`,
                        }),
                        kpiItem({
                            id: 'bust-before-passing',
                            info: <p>{kpiDescriptions.bustBeforePassing}</p>,
                            label: 'Bust before passing',
                            sub: 'same number as bust%',
                            value: formatPercent(result.bustProbability),
                        }),
                        kpiItem({
                            id: 'risk-5-losses',
                            info: <p>{kpiDescriptions.risk5Losses}</p>,
                            label: 'Risk of 5+ losses',
                            sub:
                                result.risk10LossesPercent > 0.05
                                    ? `10+: ${formatPercent(result.risk10LossesPercent)}`
                                    : '10+: rare',
                            value: formatPercent(result.risk5LossesPercent),
                        }),
                        kpiItem({
                            id: 'roi-on-cost',
                            info: <p>{kpiDescriptions.roiOnCost}</p>,
                            label: 'ROI on cost',
                            sub: `net ${formatCurrency(result.expectedNet)} / cost`,
                            value: (
                                <ValueOrMissing
                                    reason={NO_COST_ROI_REASON}
                                    value={formatOptionalPercent(
                                        result.roiOnCost.value,
                                    )}
                                />
                            ),
                        }),
                        kpiItem({
                            id: 'trades-per-pass',
                            info: <p>{kpiDescriptions.tradesPerPass}</p>,
                            label: 'Trades per pass',
                            sub: 'when you pass',
                            value: (
                                <ValueOrMissing
                                    reason={NO_PASS_REASON}
                                    value={
                                        result.tradesPerSuccessfulAttempt > 0
                                            ? String(
                                                  Math.round(
                                                      result.tradesPerSuccessfulAttempt,
                                                  ),
                                              )
                                            : null
                                    }
                                />
                            ),
                        }),
                        kpiItem({
                            id: 'max-drawdown',
                            info: (
                                <>
                                    <p>{kpiDescriptions.maxDrawdown}</p>
                                    <p className="mt-2 font-mono text-xs">
                                        P50{' '}
                                        {formatCompactCurrency(
                                            result.maxDrawdownP50,
                                        )}{' '}
                                        · P95{' '}
                                        {formatCompactCurrency(
                                            result.maxDrawdownP95,
                                        )}
                                    </p>
                                </>
                            ),
                            label: 'Max drawdown',
                            sub: `P50 ${formatCompactCurrency(result.maxDrawdownP50)}`,
                            value: formatCompactCurrency(result.maxDrawdownP95),
                        }),
                    ]}
                />
            </div>

            {attemptEconomics && (
                <AttemptEconomicsCard model={attemptEconomics} />
            )}

            {result.fundedPayoutCountDistribution.length > 0 && (
                <div>
                    <PanelSubheading as="h4" className="mb-2">
                        Payouts per funded account
                    </PanelSubheading>
                    <AccountsPassedDistributionChart
                        caption="# payouts per funded account"
                        distribution={result.fundedPayoutCountDistribution}
                        halfThreshold={false}
                    />
                </div>
            )}

            {isShowCycleEconomics && (
                <div>
                    <PanelSubheading as="h4" className="mb-2">
                        Cycle economics
                    </PanelSubheading>
                    <StatStrip
                        items={[
                            kpiItem({
                                id: 'expected-attempts',
                                info: (
                                    <>
                                        <p>
                                            {kpiDescriptions.expectedAttempts}
                                        </p>
                                        <p className="mt-2 font-mono text-xs">
                                            Mean{' '}
                                            {result.expectedAttempts.toFixed(2)}{' '}
                                            · P90{' '}
                                            {result.expectedAttemptsP90.toFixed(
                                                0,
                                            )}
                                        </p>
                                    </>
                                ),
                                label: 'Expected attempts',
                                sub: `P90: ${result.expectedAttemptsP90.toFixed(0)}`,
                                value: result.expectedAttempts.toFixed(2),
                            }),
                            kpiItem({
                                id: 'gross-spend',
                                info: (
                                    <>
                                        <p>{kpiDescriptions.expectedSpend}</p>
                                        <p className="mt-2 font-mono text-xs">
                                            Mean{' '}
                                            {formatCurrency(
                                                result.expectedGrossSpend,
                                            )}{' '}
                                            · P90{' '}
                                            {formatCurrency(
                                                result.expectedSpendP90,
                                            )}
                                        </p>
                                    </>
                                ),
                                label: 'Gross spend',
                                sub: `P90 budget: ${formatCurrency(result.expectedSpendP90)}`,
                                value: formatCurrency(
                                    result.expectedGrossSpend,
                                ),
                            }),
                            kpiItem({
                                id: 'break-even',
                                info: <p>{kpiDescriptions.breakEven}</p>,
                                label: 'Break-even',
                                sub: 'funded P&L to recoup',
                                value: formatCurrency(
                                    result.breakEvenFundedProfit,
                                ),
                            }),
                        ]}
                    />
                </div>
            )}
        </ToolPanel>
    );
}

function CostBreakdownBody({ plan, result }: CostBreakdownBodyProperties) {
    const callback = result.costBreakdown;
    const evalListed = plan.fees.oneTimeEval;
    const activationListed = plan.fees.activation;
    const rows: { label: string; value: string }[] = [];
    if (evalListed > 0) {
        rows.push({
            label: 'Eval fee',
            value: perTrialFeeValue(
                evalListed,
                callback.perAccountEvalFee,
                callback.evalFee,
            ),
        });
    }
    if (activationListed > 0) {
        rows.push({
            label: 'Activation',
            value: perTrialFeeValue(
                activationListed,
                callback.perAccountActivationFee,
                callback.activationFee,
            ),
        });
    }
    if (callback.subscriptionPerTrial > 0) {
        rows.push({
            label: 'Subscription',
            value: formatCurrency(callback.subscriptionPerTrial),
        });
    }
    if (callback.resetFeesTotal > 0) {
        rows.push({
            label: 'Reset fees',
            value: formatCurrency(callback.resetFeesTotal),
        });
    }
    if (callback.fundedResetFeesTotal > 0) {
        rows.push({
            label: 'Funded reset fees',
            value: formatCurrency(callback.fundedResetFeesTotal),
        });
    }
    return (
        <div className="flex flex-col gap-1.5">
            <p>{kpiDescriptions.totalCost}</p>
            <Card className="mt-1 gap-1 py-2">
                <CardContent className="flex flex-col gap-1 px-2 font-mono text-xs tabular-nums">
                    {rows.map((row) => (
                        <div
                            className="flex items-center justify-between gap-3"
                            key={row.label}
                        >
                            <span className="text-muted-foreground">
                                {row.label}
                            </span>
                            <span className="text-foreground">{row.value}</span>
                        </div>
                    ))}
                    <div className="mt-0.5 flex items-center justify-between gap-3 border-t border-border/40 pt-1 font-semibold">
                        <span>Total avg</span>
                        <span>{formatCurrency(result.expectedTotalCost)}</span>
                    </div>
                    {callback.subscriptionPerFundedAccount > 0 && (
                        <div className="mt-0.5 flex items-center justify-between gap-3 border-t border-border/40 pt-1">
                            <span className="text-muted-foreground">
                                Monthly subs per funded acct
                            </span>
                            <span className="text-foreground">
                                <ValueOrMissing
                                    value={formatFiniteCurrency(
                                        callback.subscriptionPerFundedAccount,
                                    )}
                                />
                            </span>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function deltaVerdictText({ positive }: DeltaChip): string {
    if (positive === null) return '';
    return positive ? ', better' : ', worse';
}

function kpiItem({
    delta,
    id,
    info,
    label,
    sub,
    value,
}: KpiItemProperties): StatStripItem {
    return {
        caption: (
            <>
                {sub}
                {delta && (
                    <span className="mt-0.5 block font-mono tabular-nums">
                        {delta.text} vs pinned{deltaVerdictText(delta)}
                    </span>
                )}
            </>
        ),
        id,
        info,
        label,
        value,
    };
}

function perTrialFeeValue(
    listedPerAccount: number,
    perAccount: number,
    perTrial: number,
): string {
    if (Math.abs(listedPerAccount - perAccount) <= 0.01) {
        return formatCurrency(perTrial);
    }
    const listedPerTrial =
        perAccount > 0
            ? (perTrial * listedPerAccount) / perAccount
            : listedPerAccount;
    return `${formatCompactCurrency(listedPerTrial)} → ${formatCurrency(perTrial)}`;
}
