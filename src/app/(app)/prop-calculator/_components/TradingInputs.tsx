'use client';

import { Settings2 } from 'lucide-react';
import { z } from 'zod';

import { CALCULATOR_FIELD_LABELS } from '~/app/(app)/prop-calculator/_components/calculatorFieldLabels';
import Eyebrow from '~/components/Eyebrow';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '~/components/ui/Popover';
import { Slider } from '~/components/ui/Slider';
import { Toggle } from '~/components/ui/Toggle';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/ToggleGroup';
import { formatCurrency, formatPercent } from '~/lib/format';
import {
    ALL_INSTRUMENTS,
    capRiskToContractLimit,
    type DayStopRule,
    describeFundedReset,
    evalContractLimit,
    fraction,
    INSTRUMENTS,
    InstrumentSymbol,
    type Plan,
    points,
    RungSizing,
} from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import {
    edgePlausibilityNoteText,
    type PlausibilityThresholds,
} from '~/lib/prop-calculator/economics';
import { simInputsSizingIssue } from '~/lib/prop-calculator/simulator';
import { cn } from '~/lib/utilities';

import DayStopRulePicker from './DayStopRulePicker';
import { EVAL_DISCOUNT_REBUY_NOTE } from './evalDiscountRebuyNote';
import {
    describeActivationFee,
    describeEvalFee,
    describeMonthlySubscriptionFee,
    purchaseCouponDiscounts,
} from './feePreview';
import { inputHints } from './kpiDescriptions';
import { describePlacedFundedRisk, placedFundedRisk } from './placedFundedRisk';
import {
    describeResetFee,
    describeRetry,
    hasResetOption,
} from './retryDescription';
import { riskDollarsToPercent, riskPercentToDollars } from './riskConversion';
import {
    RUNG_SIZING_LABELS,
    RUNG_SIZING_OPTIONS,
    UNAFFORDABLE_RUNG_LABEL,
} from './rungSizingLabels';
import { tradingInputBounds } from './tradingInputBounds';
import { SizingMode } from './types';

const SIZING_HINT_ID = 'position-sizing-hint';
const rungSizingSchema = z.enum(RungSizing);
const sizingModeSchema = z.enum(SizingMode);
const instrumentSymbolSchema = z.enum(InstrumentSymbol);

interface TradingInputsProperties {
    activationDiscountPercent: number;
    commissionPerRoundTrip: number;
    copyAccounts: number;
    dayStop: DayStopRule;
    evalDiscountPercent: number;
    firmDisplayName: string;
    idleDayProbability: number;
    instrument: InstrumentSymbol | null;
    linkActivationDiscount: boolean;
    liveTransferHazard: number;
    maxAttempts: number;
    maxCopyAccounts: number;
    maxEvalDays: number;
    monthlySubscriptionDiscountPercent: number;
    onActivationDiscountPercentChange: (n: number) => void;
    onCommissionPerRoundTripChange: (n: number) => void;
    onCopyAccountsChange: (n: number) => void;
    onDayStopChange: (rule: DayStopRule) => void;
    onEvalDiscountPercentChange: (n: number) => void;
    onIdleDayProbabilityChange: (n: number) => void;
    onInstrumentChange: (instrument: InstrumentSymbol | null) => void;
    onLinkActivationDiscountChange: (isLinked: boolean) => void;
    onLiveTransferHazardChange: (n: number) => void;
    onMaxAttemptsChange: (n: number) => void;
    onMaxEvalDaysChange: (n: number) => void;
    onMonthlySubscriptionDiscountPercentChange: (n: number) => void;
    onPayoutRequestSizeChange: (n: null | number) => void;
    onResetCoupon: () => void;
    onResetDiscountPercentChange: (n: number) => void;
    onRetainedCushionChange: (n: null | number) => void;
    onRiskDollarsChange: (n: number) => void;
    onRiskPercentChange: (n: number) => void;
    onRrRatioChange: (n: number) => void;
    onRungSizingChange: (mode: RungSizing) => void;
    onSeedChange: (n: number) => void;
    onSizingModeChange: (m: SizingMode) => void;
    onStopPointsChange: (n: number) => void;
    onTakesFundedResetChange: (isTaken: boolean) => void;
    onTakesOneTimeEarlyWithdrawalChange: (isTaken: boolean) => void;
    onTradesPerDayChange: (n: number) => void;
    onTrialsChange: (n: number) => void;
    onWinrateChange: (n: number) => void;
    payoutRequestSize: null | number;
    plan: Plan;
    resetDiscountPercent: number;
    retainedCushion: null | number;
    riskDollars: number;
    riskPercent: number;
    rrRatio: number;
    rungSizing: RungSizing;
    seed: number;
    sizingMode: SizingMode;
    stopPoints: null | number;
    takesFundedReset: boolean;
    takesOneTimeEarlyWithdrawal: boolean;
    tradesPerDay: number;
    trials: number;
    winrate: number;
}

export function tradingEdgePlausibilityNote(
    winrate: number,
    rrRatio: number,
    thresholds: PlausibilityThresholds = DEFAULT_RULEBOOK.plausibility,
): null | string {
    return edgePlausibilityNoteText(
        { rrRatio, winrate: fraction(winrate) },
        thresholds,
    );
}

export default function TradingInputs({
    activationDiscountPercent,
    commissionPerRoundTrip,
    copyAccounts,
    dayStop,
    evalDiscountPercent,
    firmDisplayName,
    idleDayProbability,
    instrument,
    linkActivationDiscount,
    liveTransferHazard,
    maxAttempts,
    maxCopyAccounts,
    maxEvalDays,
    monthlySubscriptionDiscountPercent,
    onActivationDiscountPercentChange,
    onCommissionPerRoundTripChange,
    onCopyAccountsChange,
    onDayStopChange,
    onEvalDiscountPercentChange,
    onIdleDayProbabilityChange,
    onInstrumentChange,
    onLinkActivationDiscountChange,
    onLiveTransferHazardChange,
    onMaxAttemptsChange,
    onMaxEvalDaysChange,
    onMonthlySubscriptionDiscountPercentChange,
    onPayoutRequestSizeChange,
    onResetCoupon,
    onResetDiscountPercentChange,
    onRetainedCushionChange,
    onRiskDollarsChange,
    onRiskPercentChange,
    onRrRatioChange,
    onRungSizingChange,
    onSeedChange,
    onSizingModeChange,
    onStopPointsChange,
    onTakesFundedResetChange,
    onTakesOneTimeEarlyWithdrawalChange,
    onTradesPerDayChange,
    onTrialsChange,
    onWinrateChange,
    payoutRequestSize,
    plan,
    resetDiscountPercent,
    retainedCushion,
    riskDollars,
    riskPercent,
    rrRatio,
    rungSizing,
    seed,
    sizingMode,
    stopPoints,
    takesFundedReset,
    takesOneTimeEarlyWithdrawal,
    tradesPerDay,
    trials,
    winrate,
}: TradingInputsProperties) {
    const accountSize = plan.accountSize;
    const bounds = tradingInputBounds();
    const plausibilityNote = tradingEdgePlausibilityNote(winrate, rrRatio);
    const earlyWithdrawal = plan.oneTimeEarlyWithdrawal;
    const fundedReset = plan.fundedReset;
    const purchaseDiscounts = purchaseCouponDiscounts(
        plan,
        {
            activationDiscountPercent,
            evalDiscountPercent,
            linkActivationDiscount,
            monthlySubscriptionDiscountPercent,
            resetDiscountPercent,
        },
        copyAccounts,
    );
    const retryNote = describeRetry(plan.fees, purchaseDiscounts, maxAttempts);
    const computedRisk =
        sizingMode === SizingMode.Dollar
            ? riskDollars
            : riskPercentToDollars(riskPercent, accountSize);
    const otherRepresentation =
        sizingMode === SizingMode.Dollar
            ? `≈ ${formatPercent(riskDollarsToPercent(riskDollars, accountSize) / 100, 2)} of account`
            : `≈ ${formatCurrency(computedRisk)} on $${(accountSize / 1000).toFixed(0)}K`;

    const positionSizingSpec =
        instrument === null ? null : INSTRUMENTS[instrument];
    const evalContractCap = evalContractLimit(
        plan.contractLimits,
        positionSizingSpec?.isMicro ?? false,
    );
    const feasibleRisk =
        positionSizingSpec === null || stopPoints === null
            ? null
            : capRiskToContractLimit(
                  computedRisk,
                  {
                      instrument: positionSizingSpec,
                      stopPoints: points(stopPoints),
                  },
                  evalContractCap,
              );
    const isRiskCappedByContracts =
        feasibleRisk !== null && feasibleRisk < computedRisk;
    const fundedSizing = {
        instrument: instrument ?? undefined,
        riskPerTrade: computedRisk,
        stopPoints: stopPoints ?? undefined,
    };
    const sizingRefusal = simInputsSizingIssue(fundedSizing);
    const placedRisk = placedFundedRisk({ ...fundedSizing, plan });
    const isSizingHintShown = placedRisk !== null || sizingRefusal !== null;
    const riskInputAria = {
        'aria-describedby': isSizingHintShown ? SIZING_HINT_ID : undefined,
        'aria-invalid': sizingRefusal !== null,
    };

    return (
        <div
            className={cn('app-prop-calculator__inputs', 'flex flex-col gap-5')}
        >
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Your trading system</h3>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            aria-label="Advanced settings"
                            size="icon-sm"
                            variant="ghost"
                        >
                            <Settings2 className="size-4" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-80">
                        <div className="flex flex-col gap-3">
                            <div>
                                <label
                                    className="mb-1 block text-xs font-medium text-muted-foreground"
                                    htmlFor="trials"
                                >
                                    Monte Carlo trials
                                </label>
                                <Input
                                    id="trials"
                                    max={bounds.trials.max}
                                    min={bounds.trials.min}
                                    onChange={(event) =>
                                        onTrialsChange(
                                            Number(event.target.value),
                                        )
                                    }
                                    step={bounds.trials.step}
                                    type="number"
                                    value={trials}
                                />
                            </div>
                            <div>
                                <label
                                    className="mb-1 block text-xs font-medium text-muted-foreground"
                                    htmlFor="seed"
                                >
                                    Random seed
                                </label>
                                <Input
                                    id="seed"
                                    onChange={(event) =>
                                        onSeedChange(Number(event.target.value))
                                    }
                                    type="number"
                                    value={seed}
                                />
                            </div>
                            <div>
                                <label
                                    className="mb-1 block text-xs font-medium text-muted-foreground"
                                    htmlFor="max-eval-days"
                                >
                                    Max eval days
                                </label>
                                <Input
                                    id="max-eval-days"
                                    max={bounds.maxEvalDays.max}
                                    min={bounds.maxEvalDays.min}
                                    onChange={(event) =>
                                        onMaxEvalDaysChange(
                                            Number(event.target.value),
                                        )
                                    }
                                    step={bounds.maxEvalDays.step}
                                    type="number"
                                    value={maxEvalDays}
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {inputHints.maxEvalDays}
                                </p>
                            </div>
                            <div>
                                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                                    Day-stop rule
                                </span>
                                <DayStopRulePicker
                                    onChange={onDayStopChange}
                                    value={dayStop}
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Cap intraday trading: stop after first win,
                                    K losses, or a $ target.
                                </p>
                            </div>
                            <div>
                                <label
                                    className="mb-1 block text-xs font-medium text-muted-foreground"
                                    htmlFor="retained-cushion"
                                >
                                    {
                                        CALCULATOR_FIELD_LABELS.retainedCushionRequest
                                    }
                                </label>
                                <Input
                                    id="retained-cushion"
                                    min={plan.defaultRetainedCushion()}
                                    onChange={(event) => {
                                        const raw = event.target.value;
                                        onRetainedCushionChange(
                                            raw === '' ? null : Number(raw),
                                        );
                                    }}
                                    placeholder={plan
                                        .defaultRetainedCushion()
                                        .toFixed(0)}
                                    step={100}
                                    type="number"
                                    value={retainedCushion ?? ''}
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                    How far above the drawdown floor a simulated
                                    payout stops short. Floored at the
                                    plan&apos;s full funded drawdown (
                                    {formatCurrency(
                                        plan.defaultRetainedCushion(),
                                    )}
                                    ) -- no real trader drains cushion to the
                                    edge on every withdrawal, so a lower value
                                    is clamped up to this floor.
                                </p>
                            </div>
                            <div>
                                <label
                                    className="mb-1 block text-xs font-medium text-muted-foreground"
                                    htmlFor="payout-request-size"
                                >
                                    {
                                        CALCULATOR_FIELD_LABELS.payoutRequestOverride
                                    }
                                </label>
                                <Input
                                    id="payout-request-size"
                                    min={0}
                                    onChange={(event) => {
                                        const raw = event.target.value;
                                        onPayoutRequestSizeChange(
                                            raw === '' ? null : Number(raw),
                                        );
                                    }}
                                    placeholder="Withdraw everything"
                                    step={100}
                                    type="number"
                                    value={payoutRequestSize ?? ''}
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                    How much to withdraw per payout. Empty means
                                    withdraw everything above the retained
                                    cushion.
                                </p>
                            </div>
                            {earlyWithdrawal === null ? null : (
                                <div>
                                    <span className="mb-1 block text-xs font-medium text-muted-foreground">
                                        One-time early withdrawal
                                    </span>
                                    <Toggle
                                        className="text-xs whitespace-nowrap"
                                        onPressedChange={
                                            onTakesOneTimeEarlyWithdrawalChange
                                        }
                                        pressed={takesOneTimeEarlyWithdrawal}
                                        size="sm"
                                        variant="outline"
                                    >
                                        {takesOneTimeEarlyWithdrawal
                                            ? 'Taken'
                                            : 'Not taken'}
                                    </Toggle>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Once, after the payout day gate and
                                        before the buffer clears, withdraw up to{' '}
                                        {formatPercent(
                                            earlyWithdrawal.maxProfitShare,
                                            0,
                                        )}{' '}
                                        of the profit (at least{' '}
                                        {formatCurrency(
                                            earlyWithdrawal.minRequest,
                                        )}
                                        ) while the rest stays. Counted as the
                                        first payout, so the MLL moves to start
                                        + $100 and locks, which leaves a thin
                                        cushion. Off by default.
                                    </p>
                                </div>
                            )}
                            {fundedReset === null ? null : (
                                <div>
                                    <span className="mb-1 block text-xs font-medium text-muted-foreground">
                                        {fundedReset.label}
                                    </span>
                                    <Toggle
                                        className="text-xs whitespace-nowrap"
                                        onPressedChange={
                                            onTakesFundedResetChange
                                        }
                                        pressed={takesFundedReset}
                                        size="sm"
                                        variant="outline"
                                    >
                                        {takesFundedReset
                                            ? 'Taken'
                                            : 'Not taken'}
                                    </Toggle>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {describeFundedReset(fundedReset)} The
                                        reset discount applies. Off by default.
                                    </p>
                                </div>
                            )}
                            <div>
                                <label
                                    className="mb-1 block text-xs font-medium text-muted-foreground"
                                    htmlFor="idle-day-probability"
                                >
                                    Idle-day probability
                                </label>
                                <Input
                                    id="idle-day-probability"
                                    max={1}
                                    min={0}
                                    onChange={(event) =>
                                        onIdleDayProbabilityChange(
                                            Number(event.target.value),
                                        )
                                    }
                                    step={0.01}
                                    type="number"
                                    value={idleDayProbability}
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Chance any given day has zero trades. Only
                                    matters for plans with a modeled
                                    inactivity-closure rule (e.g. MFFU Rapid
                                    EOD).
                                </p>
                            </div>
                            <div>
                                <label
                                    className="mb-1 block text-xs font-medium text-muted-foreground"
                                    htmlFor="live-transfer-hazard"
                                >
                                    Live-transfer hazard per paid payout
                                </label>
                                <Input
                                    id="live-transfer-hazard"
                                    max={1}
                                    min={0}
                                    onChange={(event) =>
                                        onLiveTransferHazardChange(
                                            Number(event.target.value),
                                        )
                                    }
                                    step={0.01}
                                    type="number"
                                    value={liveTransferHazard}
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                    The chance, after each paid payout, that
                                    the firm sends the account live, which ends
                                    its simulated payouts. It is your
                                    assumption, not a firm rule. 0 leaves
                                    transfers unpriced, as before. Only the
                                    strategy lab uses it; the results, sizing,
                                    compare and the other tools stay unpriced.
                                    In the lab, a scenario with an instrument
                                    and stop points on a plan with a verified
                                    live plan continues the account through it;
                                    otherwise the rest of a transferred account
                                    is valued at $0.
                                </p>
                            </div>
                            <div>
                                <label
                                    className="mb-1 block text-xs font-medium text-muted-foreground"
                                    htmlFor="rung-sizing"
                                >
                                    {UNAFFORDABLE_RUNG_LABEL}
                                </label>
                                <select
                                    className="h-8 w-full rounded-md border bg-transparent px-2 text-xs"
                                    id="rung-sizing"
                                    onChange={(event) => {
                                        const parsed =
                                            rungSizingSchema.safeParse(
                                                event.target.value,
                                            );
                                        if (parsed.success) {
                                            onRungSizingChange(parsed.data);
                                        }
                                    }}
                                    value={rungSizing}
                                >
                                    {RUNG_SIZING_OPTIONS.map((option) => (
                                        <option key={option} value={option}>
                                            {RUNG_SIZING_LABELS[option]}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>

            <div>
                <div className="mb-2 flex items-center justify-between">
                    <span
                        className="text-xs font-medium text-muted-foreground"
                        id="winrate-label"
                    >
                        Winrate
                    </span>
                    <span className="font-mono text-xs tabular-nums">
                        {formatPercent(winrate)}
                    </span>
                </div>
                <Slider
                    aria-labelledby="winrate-label"
                    max={0.95}
                    min={0.05}
                    onValueChange={(v) =>
                        v[0] !== undefined && onWinrateChange(v[0])
                    }
                    step={0.01}
                    value={[winrate]}
                />
            </div>

            <div>
                <div className="mb-2 flex items-center justify-between">
                    <span
                        className="text-xs font-medium text-muted-foreground"
                        id="rr-ratio-label"
                    >
                        Reward : Risk (RR)
                    </span>
                    <span className="font-mono text-xs tabular-nums">
                        {rrRatio.toFixed(2)} : 1
                    </span>
                </div>
                <Slider
                    aria-labelledby="rr-ratio-label"
                    max={5}
                    min={0.5}
                    onValueChange={(v) =>
                        v[0] !== undefined && onRrRatioChange(v[0])
                    }
                    step={0.1}
                    value={[rrRatio]}
                />
                <p className="mt-2 text-xs text-amber-400" role="status">
                    {plausibilityNote ?? ''}
                </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label
                        className="mb-2 block text-xs font-medium text-muted-foreground"
                        htmlFor="trades-per-day"
                    >
                        Trades per day
                    </label>
                    <Input
                        id="trades-per-day"
                        max={50}
                        min={1}
                        onChange={(event) =>
                            onTradesPerDayChange(Number(event.target.value))
                        }
                        step={1}
                        type="number"
                        value={tradesPerDay}
                    />
                </div>
                <div>
                    <label
                        className="mb-2 block text-xs font-medium text-muted-foreground"
                        htmlFor="commission"
                    >
                        Commission ($/trade)
                    </label>
                    <Input
                        id="commission"
                        max={50}
                        min={0}
                        onChange={(event) =>
                            onCommissionPerRoundTripChange(
                                Number(event.target.value),
                            )
                        }
                        step={0.5}
                        type="number"
                        value={commissionPerRoundTrip || ''}
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label
                        className="mb-2 block text-xs font-medium text-muted-foreground"
                        htmlFor="max-attempts"
                    >
                        Max reset attempts
                    </label>
                    <Input
                        id="max-attempts"
                        max={10}
                        min={1}
                        onChange={(event) =>
                            onMaxAttemptsChange(Number(event.target.value))
                        }
                        step={1}
                        type="number"
                        value={maxAttempts}
                    />
                    {retryNote !== null && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            {retryNote}
                        </p>
                    )}
                </div>
                <div>
                    <label
                        className="mb-2 block text-xs font-medium text-muted-foreground"
                        htmlFor="copy-accounts"
                    >
                        Copy-traded accounts
                    </label>
                    <Input
                        id="copy-accounts"
                        max={maxCopyAccounts}
                        min={1}
                        onChange={(event) =>
                            onCopyAccountsChange(Number(event.target.value))
                        }
                        step={1}
                        type="number"
                        value={copyAccounts}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                        max {maxCopyAccounts} for {firmDisplayName}
                    </p>
                </div>
            </div>

            <div>
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                        Risk per trade (1R)
                    </span>
                    <ToggleGroup
                        onValueChange={(v: string) => {
                            const parsed = sizingModeSchema.safeParse(v);
                            if (parsed.success) onSizingModeChange(parsed.data);
                        }}
                        size="sm"
                        type="single"
                        value={sizingMode}
                        variant="outline"
                    >
                        <ToggleGroupItem
                            className="h-6 px-2 text-xs"
                            value={SizingMode.Dollar}
                        >
                            $
                        </ToggleGroupItem>
                        <ToggleGroupItem
                            className="h-6 px-2 text-xs"
                            value={SizingMode.Percent}
                        >
                            %
                        </ToggleGroupItem>
                    </ToggleGroup>
                </div>
                {sizingMode === SizingMode.Dollar ? (
                    <Input
                        {...riskInputAria}
                        max={accountSize}
                        min={1}
                        onChange={(event) =>
                            onRiskDollarsChange(Number(event.target.value))
                        }
                        step={10}
                        type="number"
                        value={riskDollars}
                    />
                ) : (
                    <Input
                        {...riskInputAria}
                        max={5}
                        min={0.05}
                        onChange={(event) =>
                            onRiskPercentChange(Number(event.target.value))
                        }
                        step={0.05}
                        type="number"
                        value={riskPercent}
                    />
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                    {otherRepresentation}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                    {[0.25, 0.5, 1, 2, 5].map((preset) => {
                        const isActive =
                            sizingMode === SizingMode.Percent &&
                            Math.abs(riskPercent - preset) < 0.01;
                        return (
                            <Button
                                className="h-6 px-2 text-[11px]"
                                key={preset}
                                onClick={() => {
                                    onSizingModeChange(SizingMode.Percent);
                                    onRiskPercentChange(preset);
                                }}
                                size="sm"
                                type="button"
                                variant={isActive ? 'default' : 'outline'}
                            >
                                {preset}%
                            </Button>
                        );
                    })}
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                    <div className="flex flex-col gap-1">
                        <label
                            className="text-xs font-medium text-muted-foreground"
                            htmlFor="position-sizing-instrument"
                        >
                            {CALCULATOR_FIELD_LABELS.instrument}
                        </label>
                        <select
                            className="h-8 rounded-md border bg-transparent px-2 text-xs"
                            id="position-sizing-instrument"
                            onChange={(event) => {
                                if (event.target.value === '') {
                                    onInstrumentChange(null);
                                    return;
                                }
                                const parsed = instrumentSymbolSchema.safeParse(
                                    event.target.value,
                                );
                                if (parsed.success) {
                                    onInstrumentChange(parsed.data);
                                }
                            }}
                            value={instrument ?? ''}
                        >
                            <option value="">Not enforced</option>
                            {ALL_INSTRUMENTS.map((spec) => (
                                <option key={spec.symbol} value={spec.symbol}>
                                    {spec.symbol} (${spec.pointValue}/pt)
                                </option>
                            ))}
                        </select>
                    </div>
                    {instrument === null ? null : (
                        <div className="flex flex-col gap-1">
                            <label
                                className="text-xs font-medium text-muted-foreground"
                                htmlFor="position-sizing-stop"
                            >
                                {CALCULATOR_FIELD_LABELS.stopPoints}
                            </label>
                            <Input
                                {...riskInputAria}
                                className="w-28"
                                id="position-sizing-stop"
                                min={0.25}
                                onChange={(event) =>
                                    onStopPointsChange(
                                        Number(event.target.value),
                                    )
                                }
                                step={0.25}
                                type="number"
                                value={stopPoints ?? ''}
                            />
                        </div>
                    )}
                </div>
                {instrument !== null && stopPoints !== null ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                        {isRiskCappedByContracts
                            ? `Capped to ${formatCurrency(feasibleRisk)}/trade in eval - ${evalContractCap ?? '?'} ${positionSizingSpec?.isMicro ? 'micro' : 'mini'} contract limit at a ${stopPoints}pt stop`
                            : `Fits within the eval contract limit at a ${stopPoints}pt stop`}
                    </p>
                ) : null}
                {isSizingHintShown ? (
                    <div
                        aria-live="polite"
                        className="mt-1 flex flex-col gap-1 text-xs"
                        id={SIZING_HINT_ID}
                    >
                        {placedRisk === null ? null : (
                            <p className="text-muted-foreground">
                                {describePlacedFundedRisk(placedRisk)}
                            </p>
                        )}
                        {sizingRefusal === null ? null : (
                            <p className="text-amber-400">{sizingRefusal}</p>
                        )}
                    </div>
                ) : null}
            </div>

            <div className="border-t border-border/50 pt-4">
                <div className="mb-3 flex items-center justify-between">
                    <Eyebrow as="h4">Coupon</Eyebrow>
                    <Button
                        className="h-7 px-2 text-xs"
                        disabled={
                            evalDiscountPercent === 0 &&
                            activationDiscountPercent === 0 &&
                            monthlySubscriptionDiscountPercent === 0 &&
                            resetDiscountPercent === 0 &&
                            !linkActivationDiscount
                        }
                        onClick={onResetCoupon}
                        size="sm"
                        type="button"
                        variant="ghost"
                    >
                        Reset
                    </Button>
                </div>

                <div className="flex flex-col gap-3">
                    <div>
                        <div className="mb-1 flex items-center justify-between">
                            <label
                                className="text-xs font-medium text-muted-foreground"
                                htmlFor="eval-discount"
                            >
                                Eval fee discount
                            </label>
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                                {describeEvalFee(plan.fees, purchaseDiscounts)}
                            </span>
                        </div>
                        <div className="relative">
                            <Input
                                className="pr-7"
                                id="eval-discount"
                                max={100}
                                min={0}
                                onChange={(event) =>
                                    onEvalDiscountPercentChange(
                                        Number(event.target.value),
                                    )
                                }
                                step={1}
                                type="number"
                                value={evalDiscountPercent || ''}
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                                %
                            </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {EVAL_DISCOUNT_REBUY_NOTE}
                        </p>
                    </div>

                    <div>
                        <div className="mb-1 flex items-center justify-between">
                            <label
                                className="text-xs font-medium text-muted-foreground"
                                htmlFor="activation-discount"
                            >
                                Activation fee discount
                            </label>
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                                {describeActivationFee(
                                    plan.fees,
                                    purchaseDiscounts,
                                )}
                            </span>
                        </div>
                        <div className="flex items-stretch gap-2">
                            <div className="relative flex-1">
                                <Input
                                    className="pr-7"
                                    disabled={
                                        plan.fees.activation === 0 ||
                                        linkActivationDiscount
                                    }
                                    id="activation-discount"
                                    max={100}
                                    min={0}
                                    onChange={(event) =>
                                        onActivationDiscountPercentChange(
                                            Number(event.target.value),
                                        )
                                    }
                                    step={1}
                                    type="number"
                                    value={
                                        (linkActivationDiscount
                                            ? evalDiscountPercent
                                            : activationDiscountPercent) || ''
                                    }
                                />
                                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                                    %
                                </span>
                            </div>
                            <Toggle
                                className="text-xs whitespace-nowrap"
                                disabled={plan.fees.activation === 0}
                                onPressedChange={onLinkActivationDiscountChange}
                                pressed={linkActivationDiscount}
                                size="sm"
                                variant="outline"
                            >
                                Match eval
                            </Toggle>
                        </div>
                    </div>

                    <div>
                        <div className="mb-1 flex items-center justify-between">
                            <label
                                className="text-xs font-medium text-muted-foreground"
                                htmlFor="monthly-subscription-discount"
                            >
                                Monthly subscription discount
                            </label>
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                                {describeMonthlySubscriptionFee(
                                    plan.fees,
                                    purchaseDiscounts,
                                )}
                            </span>
                        </div>
                        <div className="relative">
                            <Input
                                className="pr-7"
                                disabled={plan.fees.monthlySubscription === 0}
                                id="monthly-subscription-discount"
                                max={100}
                                min={0}
                                onChange={(event) =>
                                    onMonthlySubscriptionDiscountPercentChange(
                                        Number(event.target.value),
                                    )
                                }
                                step={1}
                                type="number"
                                value={monthlySubscriptionDiscountPercent || ''}
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                                %
                            </span>
                        </div>
                    </div>

                    <div>
                        <div className="mb-1 flex items-center justify-between">
                            <label
                                className="text-xs font-medium text-muted-foreground"
                                htmlFor="reset-discount"
                            >
                                Reset fee discount
                            </label>
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                                {describeResetFee(plan.fees, purchaseDiscounts)}
                            </span>
                        </div>
                        <div className="relative">
                            <Input
                                className="pr-7"
                                disabled={!hasResetOption(plan.fees)}
                                id="reset-discount"
                                max={100}
                                min={0}
                                onChange={(event) =>
                                    onResetDiscountPercentChange(
                                        Number(event.target.value),
                                    )
                                }
                                step={1}
                                type="number"
                                value={resetDiscountPercent || ''}
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                                %
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
