'use client';

import { useState } from 'react';

import { Card } from '~/components/ui/Card';

import ChartPanel from './ChartPanel';
import FirmComparisonTable from './FirmComparisonTable';
import FirmPlanPicker from './FirmPlanPicker';
import { formatCompactCurrency, formatDays } from './helpers';
import { kpiDescriptions } from './kpiDescriptions';
import OptimalRiskTable from './OptimalRiskTable';
import PercentileBar from './PercentileBar';
import ResultsPanel from './ResultsPanel';
import SavedScenarios from './SavedScenarios';
import SensitivityHeatmap from './SensitivityHeatmap';
import ShareLinkButton from './ShareLinkButton';
import TradingInputs from './TradingInputs';
import { ChartType, SizingMode } from './types';
import { useCalculator } from './useCalculator';

export default function CalculatorShell() {
    const c = useCalculator();
    const [chartType, setChartType] = useState<ChartType>(
        ChartType.DaysToPassHistogram,
    );

    return (
        <div className="mb-10 flex flex-col gap-6">
            <div className="flex items-center justify-end gap-2">
                <ShareLinkButton />
                <SavedScenarios
                    state={c.state}
                    firms={c.firms}
                    onLoad={c.applyState}
                />
            </div>

            <Card className="px-6 py-6">
                <FirmPlanPicker
                    firms={c.firms}
                    firm={c.state.firm}
                    plan={c.state.plan}
                    onFirmChange={c.setFirm}
                    onPlanChange={c.setPlan}
                />
            </Card>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                <Card className="px-6 py-6">
                    <TradingInputs
                        plan={c.state.plan}
                        winrate={c.state.winrate}
                        rrRatio={c.state.rrRatio}
                        tradesPerDay={c.state.tradesPerDay}
                        sizingMode={c.state.sizingMode}
                        riskDollars={c.state.riskDollars}
                        riskPercent={c.state.riskPercent}
                        seed={c.state.seed}
                        trials={c.state.trials}
                        evalDiscountPercent={c.state.evalDiscountPercent}
                        activationDiscountPercent={
                            c.state.activationDiscountPercent
                        }
                        linkActivationDiscount={c.state.linkActivationDiscount}
                        commissionPerRoundTrip={c.state.commissionPerRoundTrip}
                        maxAttempts={c.state.maxAttempts}
                        copyAccounts={c.state.copyAccounts}
                        maxCopyAccounts={c.state.firm.maxFundedAccounts(
                            c.state.plan,
                        )}
                        firmDisplayName={c.state.firm.displayName}
                        onWinrateChange={c.setWinrate}
                        onRrRatioChange={c.setRrRatio}
                        onTradesPerDayChange={c.setTradesPerDay}
                        onSizingModeChange={c.setSizingMode}
                        onRiskDollarsChange={c.setRiskDollars}
                        onRiskPercentChange={c.setRiskPercent}
                        onSeedChange={c.setSeed}
                        onTrialsChange={c.setTrials}
                        onEvalDiscountPercentChange={c.setEvalDiscountPercent}
                        onActivationDiscountPercentChange={
                            c.setActivationDiscountPercent
                        }
                        onLinkActivationDiscountChange={
                            c.setLinkActivationDiscount
                        }
                        onCommissionPerRoundTripChange={
                            c.setCommissionPerRoundTrip
                        }
                        onMaxAttemptsChange={c.setMaxAttempts}
                        onCopyAccountsChange={c.setCopyAccounts}
                        onResetCoupon={c.resetCoupon}
                    />
                </Card>

                <ResultsPanel
                    plan={c.state.plan}
                    result={c.result}
                    pinned={c.pinned?.result ?? null}
                    onPin={c.pinScenario}
                    onUnpin={c.unpinScenario}
                    isPending={c.isPending}
                />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <PercentileBar
                    label="Final balance distribution"
                    p5={c.result.finalBalanceP5}
                    p25={c.result.finalBalanceP25}
                    p50={c.result.finalBalanceP50}
                    p75={c.result.finalBalanceP75}
                    p95={c.result.finalBalanceP95}
                    formatValue={formatCompactCurrency}
                    description={kpiDescriptions.finalBalance}
                    referenceLine={{
                        value: c.state.plan.accountSize,
                        label: 'Starting balance',
                    }}
                />
                <PercentileBar
                    label="Days to pass distribution"
                    p5={c.result.daysToPassP25}
                    p25={c.result.daysToPassP25}
                    p50={c.result.daysToPassP50}
                    p75={c.result.daysToPassP75}
                    p95={c.result.daysToPassP75}
                    formatValue={formatDays}
                    description="Distribution of trading days needed to hit the profit target across passing trials."
                />
            </div>

            <ChartPanel
                chartType={chartType}
                onChartTypeChange={setChartType}
                result={c.result}
                totalTrials={c.state.trials}
                maxEvalDays={c.state.maxEvalDays}
            />

            <OptimalRiskTable
                plan={c.state.plan}
                baseInputs={c.simInputs}
                currentRiskPercent={
                    c.state.sizingMode === SizingMode.Percent
                        ? c.state.riskPercent
                        : (c.state.riskDollars / c.state.plan.accountSize) * 100
                }
            />

            <SensitivityHeatmap
                plan={c.state.plan}
                baseInputs={c.simInputs}
                currentWinrate={c.state.winrate}
                currentRR={c.state.rrRatio}
            />

            <FirmComparisonTable
                firms={c.firms}
                activeFirmId={c.state.firm.id}
                targetAccountSize={c.state.plan.accountSize}
                baseInputs={c.simInputs}
            />

            <p className="text-xs text-muted-foreground">
                Monte Carlo simulation with fixed-RR trades, no commissions or
                slippage. Firm rules are a snapshot — verify against the
                firm&apos;s current pricing before opening an account.
            </p>
        </div>
    );
}
