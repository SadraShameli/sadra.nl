'use client';

import { useState } from 'react';

import { Card } from '~/components/ui/Card';
import { FirmId } from '~/lib/prop-calculator';

import ChartPanel from './ChartPanel';
import CompoundingPanel from './CompoundingPanel';
import DrawdownDurationPanel from './DrawdownDurationPanel';
import FirmComparisonTable from './FirmComparisonTable';
import FirmPlanPicker from './FirmPlanPicker';
import { formatCompactCurrency, formatDays } from './helpers';
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
            id: 'default-apex-50k-eod',
            firmId: FirmId.Apex,
            planId: {
                firm: FirmId.Apex,
                accountSize: 50_000,
                variant: 'eod' as const,
            },
            count: 20,
            evalDiscountPercent: 0,
            activationDiscountPercent: 0,
            linkActivationDiscount: false,
            memory: {},
        },
    ]);

    return (
        <div className="mb-10 flex flex-col gap-6">
            <SectionNav />

            <div
                id="simulator"
                data-section-label="Simulator"
                className="flex scroll-mt-26 flex-col gap-6"
            >
                <div className="flex items-center justify-end gap-2">
                    <ShareLinkButton />
                    <SavedScenarios
                        state={c.state}
                        firms={c.firms}
                        onLoad={c.applyState}
                    />
                </div>
                <Card className="flex flex-col gap-4 px-6 py-6">
                    <FirmPlanPicker
                        firms={c.firms}
                        firm={c.state.firm}
                        plan={c.state.plan}
                        onFirmChange={c.setFirm}
                        onPlanChange={c.setPlan}
                    />
                    <PlanStatsBadges plan={c.state.plan} />
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
                            maxEvalDays={c.state.maxEvalDays}
                            evalDiscountPercent={c.state.evalDiscountPercent}
                            activationDiscountPercent={
                                c.state.activationDiscountPercent
                            }
                            linkActivationDiscount={
                                c.state.linkActivationDiscount
                            }
                            commissionPerRoundTrip={
                                c.state.commissionPerRoundTrip
                            }
                            maxAttempts={c.state.maxAttempts}
                            copyAccounts={c.state.copyAccounts}
                            maxCopyAccounts={c.state.firm.maxFundedAccounts(
                                c.state.plan,
                            )}
                            firmDisplayName={c.state.firm.displayName}
                            dayStop={c.state.dayStop}
                            onWinrateChange={c.setWinrate}
                            onRrRatioChange={c.setRrRatio}
                            onTradesPerDayChange={c.setTradesPerDay}
                            onSizingModeChange={c.setSizingMode}
                            onRiskDollarsChange={c.setRiskDollars}
                            onRiskPercentChange={c.setRiskPercent}
                            onSeedChange={c.setSeed}
                            onTrialsChange={c.setTrials}
                            onMaxEvalDaysChange={c.setMaxEvalDays}
                            onEvalDiscountPercentChange={
                                c.setEvalDiscountPercent
                            }
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
                            onDayStopChange={c.setDayStop}
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
            </div>

            <div
                id="strategy"
                data-section-label="Strategy"
                className="scroll-mt-26"
            >
                <StrategyAnalysis
                    plan={c.state.plan}
                    result={c.result}
                    winrate={c.state.winrate}
                    rrRatio={c.state.rrRatio}
                    riskPerTrade={c.simInputs.riskPerTrade}
                    fundedHorizonDays={c.simInputs.fundedHorizonDays}
                    copyAccounts={c.state.copyAccounts}
                />
            </div>

            <div
                id="tail-risk"
                data-section-label="Tail Risk"
                className="scroll-mt-26"
            >
                <TailRiskPanel result={c.result} />
            </div>

            <div
                id="portfolio"
                data-section-label="Portfolio"
                className="scroll-mt-26"
            >
                <PortfolioPanel
                    firms={c.firms}
                    baseInputs={c.simInputs}
                    currentFirm={c.state.firm}
                    currentPlan={c.state.plan}
                    portfolio={portfolio}
                    onPortfolioChange={setPortfolio}
                />
            </div>

            <div
                id="charts"
                data-section-label="Charts"
                className="flex scroll-mt-26 flex-col gap-3"
            >
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
                        p5={c.result.daysToPassP5}
                        p25={c.result.daysToPassP25}
                        p50={c.result.daysToPassP50}
                        p75={c.result.daysToPassP75}
                        p95={c.result.daysToPassP95}
                        formatValue={formatDays}
                        description={kpiDescriptions.daysToPass}
                    />
                </div>
                <ChartPanel
                    chartType={chartType}
                    onChartTypeChange={setChartType}
                    result={c.result}
                    totalTrials={c.state.trials}
                    maxEvalDays={c.state.maxEvalDays}
                />
            </div>

            <div
                id="drawdown"
                data-section-label="Drawdown"
                className="scroll-mt-26"
            >
                <DrawdownDurationPanel result={c.result} />
            </div>

            <div
                id="compounding"
                data-section-label="Compounding"
                className="scroll-mt-26"
            >
                <CompoundingPanel
                    winrate={c.state.winrate}
                    rrRatio={c.state.rrRatio}
                    tradesPerDay={c.state.tradesPerDay}
                    riskPercent={
                        (c.simInputs.riskPerTrade / c.state.plan.accountSize) *
                        100
                    }
                    seed={c.state.seed}
                    startBalance={c.state.plan.accountSize}
                />
            </div>

            <div
                id="resilience"
                data-section-label="Resilience"
                className="scroll-mt-26"
            >
                <ResiliencePanel
                    plan={c.state.plan}
                    result={c.result}
                    winrate={c.state.winrate}
                    riskPerTrade={c.simInputs.riskPerTrade}
                />
            </div>

            <div
                id="optimal-risk"
                data-section-label="Optimal Risk"
                className="scroll-mt-26"
            >
                <OptimalRiskTable
                    plan={c.state.plan}
                    baseInputs={c.simInputs}
                    currentRiskPercent={
                        c.state.sizingMode === SizingMode.Percent
                            ? c.state.riskPercent
                            : (c.state.riskDollars / c.state.plan.accountSize) *
                              100
                    }
                />
            </div>

            <div
                id="sensitivity"
                data-section-label="Sensitivity"
                className="scroll-mt-26"
            >
                <SensitivityHeatmap
                    plan={c.state.plan}
                    baseInputs={c.simInputs}
                    currentWinrate={c.state.winrate}
                    currentRR={c.state.rrRatio}
                />
            </div>

            <div
                id="plan-comparison"
                data-section-label="Plans"
                className="scroll-mt-26"
            >
                <PlanComparisonTable
                    firm={c.state.firm}
                    activePlan={c.state.plan}
                    baseInputs={c.simInputs}
                />
            </div>

            <div
                id="firm-comparison"
                data-section-label="Firms"
                className="scroll-mt-26"
            >
                <FirmComparisonTable
                    firms={c.firms}
                    activeFirmId={c.state.firm.id}
                    targetAccountSize={c.state.plan.accountSize}
                    baseInputs={c.simInputs}
                />
            </div>

            <div
                id="strategy-lab"
                data-section-label="Strategy Lab"
                className="scroll-mt-26"
            >
                <StrategyLabPanel
                    plan={c.state.plan}
                    seed={c.state.seed}
                    maxEvalDays={c.state.maxEvalDays}
                    fundedHorizonDays={c.state.fundedHorizonDays}
                    commissionPerRoundTrip={c.state.commissionPerRoundTrip}
                    evalDiscountPercent={c.state.evalDiscountPercent}
                    activationDiscountPercent={
                        c.state.activationDiscountPercent
                    }
                    linkActivationDiscount={c.state.linkActivationDiscount}
                    scenarios={c.state.labScenarios}
                    onUpdate={c.updateLabScenario}
                    onRemove={c.removeLabScenario}
                    onAdd={c.addLabScenario}
                    onReset={c.resetLabScenarios}
                />
            </div>
        </div>
    );
}
