'use client';

import { type ReactNode } from 'react';

import { Card } from '~/components/ui/Card';
import { Input } from '~/components/ui/Input';
import { cn } from '~/lib/utilities';

import { AppliedEvalLadderNotice } from './AppliedEvalLadderNotice';
import { CALCULATOR_FIELD_LABELS } from './calculatorFieldLabels';
import {
    useCalculatorActions,
    useCalculatorInputs,
} from './CalculatorProvider';
import FirmPlanPicker from './FirmPlanPicker';
import PlanStatsBadges from './PlanStatsBadges';
import { tradingInputBounds } from './tradingInputBounds';
import TradingInputs from './TradingInputs';

interface CalculatorInputsFormProperties {
    aside?: ReactNode;
}

export function CalculatorInputsForm({
    aside,
}: CalculatorInputsFormProperties) {
    const { firms, state } = useCalculatorInputs();
    const actions = useCalculatorActions();
    const bounds = tradingInputBounds();

    return (
        <>
            <AppliedEvalLadderNotice />
            <Card className="flex flex-col gap-4 px-6 py-6">
                <FirmPlanPicker
                    firm={state.firm}
                    firms={firms}
                    onFirmChange={actions.setFirm}
                    onPlanChange={actions.setPlan}
                    plan={state.plan}
                />
                <PlanStatsBadges plan={state.plan} />
            </Card>
            <div
                className={cn(
                    'gap-6',
                    aside === undefined
                        ? 'flex flex-col'
                        : 'grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]',
                )}
            >
                <Card className="px-6 py-6">
                    <TradingInputs
                        activationDiscountPercent={
                            state.activationDiscountPercent
                        }
                        commissionPerRoundTrip={state.commissionPerRoundTrip}
                        copyAccounts={state.copyAccounts}
                        dayStop={state.dayStop}
                        evalDiscountPercent={state.evalDiscountPercent}
                        firmDisplayName={state.firm.displayName}
                        idleDayProbability={state.idleDayProbability}
                        instrument={state.instrument}
                        linkActivationDiscount={state.linkActivationDiscount}
                        liveTransferHazard={state.liveTransferHazard}
                        maxAttempts={state.maxAttempts}
                        maxCopyAccounts={state.firm.maxFundedAccounts(
                            state.plan,
                        )}
                        maxEvalDays={state.maxEvalDays}
                        monthlySubscriptionDiscountPercent={
                            state.monthlySubscriptionDiscountPercent
                        }
                        onActivationDiscountPercentChange={
                            actions.setActivationDiscountPercent
                        }
                        onCommissionPerRoundTripChange={
                            actions.setCommissionPerRoundTrip
                        }
                        onCopyAccountsChange={actions.setCopyAccounts}
                        onDayStopChange={actions.setDayStop}
                        onEvalDiscountPercentChange={
                            actions.setEvalDiscountPercent
                        }
                        onIdleDayProbabilityChange={
                            actions.setIdleDayProbability
                        }
                        onInstrumentChange={actions.setInstrument}
                        onLinkActivationDiscountChange={
                            actions.setLinkActivationDiscount
                        }
                        onLiveTransferHazardChange={
                            actions.setLiveTransferHazard
                        }
                        onMaxAttemptsChange={actions.setMaxAttempts}
                        onMaxEvalDaysChange={actions.setMaxEvalDays}
                        onMonthlySubscriptionDiscountPercentChange={
                            actions.setMonthlySubscriptionDiscountPercent
                        }
                        onPayoutRequestSizeChange={actions.setPayoutRequestSize}
                        onResetCoupon={actions.resetCoupon}
                        onResetDiscountPercentChange={
                            actions.setResetDiscountPercent
                        }
                        onRetainedCushionChange={actions.setRetainedCushion}
                        onRiskDollarsChange={actions.setRiskDollars}
                        onRiskPercentChange={actions.setRiskPercent}
                        onRrRatioChange={actions.setRrRatio}
                        onRungSizingChange={actions.setRungSizing}
                        onSeedChange={actions.setSeed}
                        onSizingModeChange={actions.setSizingMode}
                        onStopPointsChange={actions.setStopPoints}
                        onTakesFundedResetChange={actions.setTakesFundedReset}
                        onTakesOneTimeEarlyWithdrawalChange={
                            actions.setTakesOneTimeEarlyWithdrawal
                        }
                        onTradesPerDayChange={actions.setTradesPerDay}
                        onTrialsChange={actions.setTrials}
                        onWinrateChange={actions.setWinrate}
                        payoutRequestSize={state.payoutRequestSize}
                        plan={state.plan}
                        resetDiscountPercent={state.resetDiscountPercent}
                        retainedCushion={state.retainedCushion}
                        riskDollars={state.riskDollars}
                        riskPercent={state.riskPercent}
                        rrRatio={state.rrRatio}
                        rungSizing={state.rungSizing}
                        seed={state.seed}
                        sizingMode={state.sizingMode}
                        stopPoints={state.stopPoints}
                        takesFundedReset={state.takesFundedReset}
                        takesOneTimeEarlyWithdrawal={
                            state.takesOneTimeEarlyWithdrawal
                        }
                        tradesPerDay={state.tradesPerDay}
                        trials={state.trials}
                        winrate={state.winrate}
                    />
                    <div className="mt-5 border-t border-border/40 pt-4">
                        <label
                            className="mb-1 block text-xs font-medium text-muted-foreground"
                            htmlFor="funded-horizon-days"
                        >
                            {CALCULATOR_FIELD_LABELS.fundedHorizonDays}
                        </label>
                        <Input
                            id="funded-horizon-days"
                            max={bounds.fundedHorizonDays.max}
                            min={bounds.fundedHorizonDays.min}
                            onChange={(event) =>
                                actions.setFundedHorizonDays(
                                    Number(event.target.value),
                                )
                            }
                            step={bounds.fundedHorizonDays.step}
                            type="number"
                            value={state.fundedHorizonDays}
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                            Funded trading days simulated after a pass. Funded
                            survival, payouts and the horizon credit in monthly
                            net are measured over this window.
                        </p>
                    </div>
                </Card>
                {aside}
            </div>
        </>
    );
}
