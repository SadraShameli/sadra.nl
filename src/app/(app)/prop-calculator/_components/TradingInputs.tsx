'use client';

import { Settings2 } from 'lucide-react';

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
import {
    formatCompactCurrency,
    formatCurrency,
    formatPercent,
} from '~/lib/format';
import {
    ALL_INSTRUMENTS,
    capRiskToContractLimit,
    type DayStopRule,
    INSTRUMENTS,
    type InstrumentSymbol,
    type Plan,
    points,
    resolveContractLimit,
    type RungSizing,
    TradingPhase,
} from '~/lib/prop-calculator';
import { cn } from '~/lib/utilities';

import DayStopRulePicker from './DayStopRulePicker';
import { riskDollarsToPercent, riskPercentToDollars } from './riskConversion';
import { SizingMode } from './types';

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
    tradesPerDay: number;
    trials: number;
    winrate: number;
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
    tradesPerDay,
    trials,
    winrate,
}: TradingInputsProperties) {
    const accountSize = plan.accountSize;
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
    const evalContractLimit = resolveContractLimit(
        plan.contractLimits,
        TradingPhase.Eval,
        positionSizingSpec?.isMicro ?? false,
        0,
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
                  evalContractLimit,
              );
    const isRiskCappedByContracts =
        feasibleRisk !== null && feasibleRisk < computedRisk;

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
                                    max={5000}
                                    min={100}
                                    onChange={(event) =>
                                        onTrialsChange(
                                            Number(event.target.value),
                                        )
                                    }
                                    step={100}
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
                                    max={365}
                                    min={10}
                                    onChange={(event) =>
                                        onMaxEvalDaysChange(
                                            Number(event.target.value),
                                        )
                                    }
                                    step={5}
                                    type="number"
                                    value={maxEvalDays}
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Trials that hit this limit count as timeouts
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
                                    Retained cushion on payout ($)
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
                                    Payout request size ($)
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
                                    htmlFor="rung-sizing"
                                >
                                    Unaffordable rung
                                </label>
                                <select
                                    className="h-8 w-full rounded-md border bg-transparent px-2 text-xs"
                                    id="rung-sizing"
                                    onChange={(event) =>
                                        onRungSizingChange(
                                            event.target.value as RungSizing,
                                        )
                                    }
                                    value={rungSizing}
                                >
                                    <option value="capToCushion">
                                        Cap to cushion
                                    </option>
                                    <option value="skipIfUnaffordable">
                                        Skip trade
                                    </option>
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
                    {maxAttempts > 1 && plan.fees.reset > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            Up to {maxAttempts - 1} resets at{' '}
                            {`$${plan.fees.reset.toFixed(0)}`} each on bust.
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
                            if (v) onSizingModeChange(v as SizingMode);
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
                            Instrument (contract-limit enforcement)
                        </label>
                        <select
                            className="h-8 rounded-md border bg-transparent px-2 text-xs"
                            id="position-sizing-instrument"
                            onChange={(event) =>
                                onInstrumentChange(
                                    event.target.value === ''
                                        ? null
                                        : (event.target
                                              .value as InstrumentSymbol),
                                )
                            }
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
                                Stop distance (points)
                            </label>
                            <Input
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
                            ? `Capped to ${formatCurrency(feasibleRisk)}/trade in eval - ${evalContractLimit ?? '?'} ${positionSizingSpec?.isMicro ? 'micro' : 'mini'} contract limit at a ${stopPoints}pt stop`
                            : `Fits within the eval contract limit at a ${stopPoints}pt stop`}
                    </p>
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
                                {plan.fees.oneTimeEval > 0
                                    ? evalDiscountPercent > 0
                                        ? `${formatCompactCurrency(
                                              plan.fees.oneTimeEval,
                                          )} → ${formatCompactCurrency(
                                              plan.fees.oneTimeEval *
                                                  (1 -
                                                      evalDiscountPercent /
                                                          100),
                                          )}`
                                        : formatCompactCurrency(
                                              plan.fees.oneTimeEval,
                                          )
                                    : 'no eval fee'}
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
                                {plan.fees.activation > 0
                                    ? (() => {
                                          const effectiveDiscount =
                                              linkActivationDiscount
                                                  ? evalDiscountPercent
                                                  : activationDiscountPercent;
                                          return effectiveDiscount > 0
                                              ? `${formatCompactCurrency(
                                                    plan.fees.activation,
                                                )} → ${formatCompactCurrency(
                                                    plan.fees.activation *
                                                        (1 -
                                                            effectiveDiscount /
                                                                100),
                                                )}`
                                              : formatCompactCurrency(
                                                    plan.fees.activation,
                                                );
                                      })()
                                    : 'no activation fee'}
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
                                {plan.fees.monthlySubscription > 0
                                    ? monthlySubscriptionDiscountPercent > 0
                                        ? `${formatCompactCurrency(
                                              plan.fees.monthlySubscription,
                                          )} → ${formatCompactCurrency(
                                              plan.fees.monthlySubscription *
                                                  (1 -
                                                      monthlySubscriptionDiscountPercent /
                                                          100),
                                          )}`
                                        : formatCompactCurrency(
                                              plan.fees.monthlySubscription,
                                          )
                                    : 'no monthly subscription'}
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
                                {plan.fees.reset > 0
                                    ? resetDiscountPercent > 0
                                        ? `${formatCompactCurrency(
                                              plan.fees.reset,
                                          )} → ${formatCompactCurrency(
                                              plan.fees.reset *
                                                  (1 -
                                                      resetDiscountPercent /
                                                          100),
                                          )}`
                                        : formatCompactCurrency(plan.fees.reset)
                                    : 'no reset fee'}
                            </span>
                        </div>
                        <div className="relative">
                            <Input
                                className="pr-7"
                                disabled={plan.fees.reset === 0}
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
