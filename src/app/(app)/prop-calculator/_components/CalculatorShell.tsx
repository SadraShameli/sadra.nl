'use client';

import { useState } from 'react';

import { Card } from '~/components/ui/Card';
import { formatCompactCurrency, formatDays } from '~/lib/format';
import { FirmId } from '~/lib/prop-calculator';

import ChartPanel from './ChartPanel';
import CompoundingPanel from './CompoundingPanel';
import DrawdownDurationPanel from './DrawdownDurationPanel';
import FirmComparisonTable from './FirmComparisonTable';
import FirmPlanPicker from './FirmPlanPicker';
import { kpiDescriptions } from './kpiDescriptions';
import OptimalRiskTable from './OptimalRiskTable';
import PercentileBar from './PercentileBar';
import PlanComparisonTable from './PlanComparisonTable';
import PlanStatsBadges from './PlanStatsBadges';
import PortfolioPanel from './PortfolioPanel';
import ResiliencePanel from './ResiliencePanel';
import ResultsPanel from './ResultsPanel';
import SavedScenarios from './SavedScenarios';
import SectionNav from './SectionNav';
import SensitivityHeatmap from './SensitivityHeatmap';
import ShareLinkButton from './ShareLinkButton';
import StrategyAnalysis from './StrategyAnalysis';
import StrategyLabPanel from './StrategyLabPanel';
import TailRiskPanel from './TailRiskPanel';
import TradingInputs from './TradingInputs';
import { ChartType, type PortfolioEntry, SizingMode } from './types';
import { useCalculator } from './useCalculator';

export default function CalculatorShell() {
    const c = useCalculator();
    const [chartType, setChartType] = useState<ChartType>(
        ChartType.DaysToPassHistogram,
    );
    const [portfolio, setPortfolio] = useState<PortfolioEntry[]>([
        {
            activationDiscountPercent: 0,
            count: 20,
            evalDiscountPercent: 0,
            firmId: FirmId.Apex,
            id: 'default-apex-50k-eod',
            linkActivationDiscount: false,
            memory: {},
            planId: {
                accountSize: 50_000,
                firm: FirmId.Apex,
                variant: 'eod' as const,
            },
        },
    ]);

    return (
        <div className="mb-10 flex flex-col gap-6">
            <SectionNav />

            <div
                className="flex scroll-mt-26 flex-col gap-6"
                data-section-label="Simulator"
                id="simulator"
            >
                <div className="flex items-center justify-end gap-2">
                    <ShareLinkButton />
                    <SavedScenarios
                        firms={c.firms}
                        onLoad={c.applyState}
                        state={c.state}
                    />
                </div>
                <Card className="flex flex-col gap-4 px-6 py-6">
                    <FirmPlanPicker
                        firm={c.state.firm}
                        firms={c.firms}
                        onFirmChange={c.setFirm}
                        onPlanChange={c.setPlan}
                        plan={c.state.plan}
                    />
                    <PlanStatsBadges plan={c.state.plan} />
                </Card>
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                    <Card className="px-6 py-6">
                        <TradingInputs
                            activationDiscountPercent={
                                c.state.activationDiscountPercent
                            }
                            commissionPerRoundTrip={
                                c.state.commissionPerRoundTrip
                            }
                            copyAccounts={c.state.copyAccounts}
                            dayStop={c.state.dayStop}
                            evalDiscountPercent={c.state.evalDiscountPercent}
                            firmDisplayName={c.state.firm.displayName}
                            linkActivationDiscount={
                                c.state.linkActivationDiscount
                            }
                            maxAttempts={c.state.maxAttempts}
                            maxCopyAccounts={c.state.firm.maxFundedAccounts(
                                c.state.plan,
                            )}
                            maxEvalDays={c.state.maxEvalDays}
                            onActivationDiscountPercentChange={
                                c.setActivationDiscountPercent
                            }
                            onCommissionPerRoundTripChange={
                                c.setCommissionPerRoundTrip
                            }
                            onCopyAccountsChange={c.setCopyAccounts}
                            onDayStopChange={c.setDayStop}
                            onEvalDiscountPercentChange={
                                c.setEvalDiscountPercent
                            }
                            onLinkActivationDiscountChange={
                                c.setLinkActivationDiscount
                            }
                            onMaxAttemptsChange={c.setMaxAttempts}
                            onMaxEvalDaysChange={c.setMaxEvalDays}
                            onResetCoupon={c.resetCoupon}
                            onRiskDollarsChange={c.setRiskDollars}
                            onRiskPercentChange={c.setRiskPercent}
                            onRrRatioChange={c.setRrRatio}
                            onSeedChange={c.setSeed}
                            onSizingModeChange={c.setSizingMode}
                            onTradesPerDayChange={c.setTradesPerDay}
                            onTrialsChange={c.setTrials}
                            onWinrateChange={c.setWinrate}
                            plan={c.state.plan}
                            riskDollars={c.state.riskDollars}
                            riskPercent={c.state.riskPercent}
                            rrRatio={c.state.rrRatio}
                            seed={c.state.seed}
                            sizingMode={c.state.sizingMode}
                            tradesPerDay={c.state.tradesPerDay}
                            trials={c.state.trials}
                            winrate={c.state.winrate}
                        />
                    </Card>
                    <ResultsPanel
                        isPending={c.isPending}
                        onPin={c.pinScenario}
                        onUnpin={c.unpinScenario}
                        pinned={c.pinned?.result ?? null}
                        plan={c.state.plan}
                        result={c.result}
                    />
                </div>
            </div>

            <div
                className="scroll-mt-26"
                data-section-label="Strategy"
                id="strategy"
            >
                <StrategyAnalysis
                    copyAccounts={c.state.copyAccounts}
                    fundedHorizonDays={c.simInputs.fundedHorizonDays}
                    plan={c.state.plan}
                    result={c.result}
                    riskPerTrade={c.simInputs.riskPerTrade}
                    rrRatio={c.state.rrRatio}
                    winrate={c.state.winrate}
                />
            </div>

            <div
                className="scroll-mt-26"
                data-section-label="Tail Risk"
                id="tail-risk"
            >
                <TailRiskPanel result={c.result} />
            </div>

            <div
                className="scroll-mt-26"
                data-section-label="Portfolio"
                id="portfolio"
            >
                <PortfolioPanel
                    baseInputs={c.simInputs}
                    currentFirm={c.state.firm}
                    currentPlan={c.state.plan}
                    firms={c.firms}
                    onPortfolioChange={setPortfolio}
                    portfolio={portfolio}
                />
            </div>

            <div
                className="flex scroll-mt-26 flex-col gap-3"
                data-section-label="Charts"
                id="charts"
            >
                <div className="grid gap-3 md:grid-cols-2">
                    <PercentileBar
                        description={kpiDescriptions.finalBalance}
                        formatValue={formatCompactCurrency}
                        label="Final balance distribution"
                        p5={c.result.finalBalanceP5}
                        p25={c.result.finalBalanceP25}
                        p50={c.result.finalBalanceP50}
                        p75={c.result.finalBalanceP75}
                        p95={c.result.finalBalanceP95}
                        referenceLine={{
                            label: 'Starting balance',
                            value: c.state.plan.accountSize,
                        }}
                    />
                    <PercentileBar
                        description={kpiDescriptions.daysToPass}
                        formatValue={formatDays}
                        label="Days to pass distribution"
                        p5={c.result.daysToPassP5}
                        p25={c.result.daysToPassP25}
                        p50={c.result.daysToPassP50}
                        p75={c.result.daysToPassP75}
                        p95={c.result.daysToPassP95}
                    />
                </div>
                <ChartPanel
                    chartType={chartType}
                    maxEvalDays={c.state.maxEvalDays}
                    onChartTypeChange={setChartType}
                    result={c.result}
                    totalTrials={c.state.trials}
                />
            </div>

            <div
                className="scroll-mt-26"
                data-section-label="Drawdown"
                id="drawdown"
            >
                <DrawdownDurationPanel result={c.result} />
            </div>

            <div
                className="scroll-mt-26"
                data-section-label="Compounding"
                id="compounding"
            >
                <CompoundingPanel
                    riskPercent={
                        (c.simInputs.riskPerTrade / c.state.plan.accountSize) *
                        100
                    }
                    rrRatio={c.state.rrRatio}
                    seed={c.state.seed}
                    startBalance={c.state.plan.accountSize}
                    tradesPerDay={c.state.tradesPerDay}
                    winrate={c.state.winrate}
                />
            </div>

            <div
                className="scroll-mt-26"
                data-section-label="Resilience"
                id="resilience"
            >
                <ResiliencePanel
                    plan={c.state.plan}
                    result={c.result}
                    riskPerTrade={c.simInputs.riskPerTrade}
                    winrate={c.state.winrate}
                />
            </div>

            <div
                className="scroll-mt-26"
                data-section-label="Optimal Risk"
                id="optimal-risk"
            >
                <OptimalRiskTable
                    baseInputs={c.simInputs}
                    currentRiskPercent={
                        c.state.sizingMode === SizingMode.Percent
                            ? c.state.riskPercent
                            : (c.state.riskDollars / c.state.plan.accountSize) *
                              100
                    }
                    plan={c.state.plan}
                />
            </div>

            <div
                className="scroll-mt-26"
                data-section-label="Sensitivity"
                id="sensitivity"
            >
                <SensitivityHeatmap
                    baseInputs={c.simInputs}
                    currentRR={c.state.rrRatio}
                    currentWinrate={c.state.winrate}
                    plan={c.state.plan}
                />
            </div>

            <div
                className="scroll-mt-26"
                data-section-label="Plans"
                id="plan-comparison"
            >
                <PlanComparisonTable
                    activePlan={c.state.plan}
                    baseInputs={c.simInputs}
                    firm={c.state.firm}
                />
            </div>

            <div
                className="scroll-mt-26"
                data-section-label="Firms"
                id="firm-comparison"
            >
                <FirmComparisonTable
                    activeFirmId={c.state.firm.id}
                    baseInputs={c.simInputs}
                    firms={c.firms}
                    targetAccountSize={c.state.plan.accountSize}
                />
            </div>

            <div
                className="scroll-mt-26"
                data-section-label="Strategy Lab"
                id="strategy-lab"
            >
                <StrategyLabPanel
                    activationDiscountPercent={
                        c.state.activationDiscountPercent
                    }
                    commissionPerRoundTrip={c.state.commissionPerRoundTrip}
                    evalDiscountPercent={c.state.evalDiscountPercent}
                    fundedHorizonDays={c.state.fundedHorizonDays}
                    linkActivationDiscount={c.state.linkActivationDiscount}
                    maxEvalDays={c.state.maxEvalDays}
                    onAdd={c.addLabScenario}
                    onRemove={c.removeLabScenario}
                    onReset={c.resetLabScenarios}
                    onUpdate={c.updateLabScenario}
                    plan={c.state.plan}
                    scenarios={c.state.labScenarios}
                    seed={c.state.seed}
                />
            </div>
        </div>
    );
}
