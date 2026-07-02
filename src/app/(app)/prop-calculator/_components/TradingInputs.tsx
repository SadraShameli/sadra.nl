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
import { type DayStopRule, type Plan } from '~/lib/prop-calculator';
import { cn } from '~/lib/utils';

import DayStopRulePicker from './DayStopRulePicker';
import { SizingMode } from './types';

interface TradingInputsProperties {
    activationDiscountPercent: number;
    commissionPerRoundTrip: number;
    copyAccounts: number;
    dayStop: DayStopRule;
    evalDiscountPercent: number;
    firmDisplayName: string;
    linkActivationDiscount: boolean;
    maxAttempts: number;
    maxCopyAccounts: number;
    maxEvalDays: number;
    onActivationDiscountPercentChange: (n: number) => void;
    onCommissionPerRoundTripChange: (n: number) => void;
    onCopyAccountsChange: (n: number) => void;
    onDayStopChange: (rule: DayStopRule) => void;
    onEvalDiscountPercentChange: (n: number) => void;
    onLinkActivationDiscountChange: (linked: boolean) => void;
    onMaxAttemptsChange: (n: number) => void;
    onMaxEvalDaysChange: (n: number) => void;
    onResetCoupon: () => void;
    onRiskDollarsChange: (n: number) => void;
    onRiskPercentChange: (n: number) => void;
    onRrRatioChange: (n: number) => void;
    onSeedChange: (n: number) => void;
    onSizingModeChange: (m: SizingMode) => void;
    onTradesPerDayChange: (n: number) => void;
    onTrialsChange: (n: number) => void;
    onWinrateChange: (n: number) => void;
    plan: Plan;
    riskDollars: number;
    riskPercent: number;
    rrRatio: number;
    seed: number;
    sizingMode: SizingMode;
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
    linkActivationDiscount,
    maxAttempts,
    maxCopyAccounts,
    maxEvalDays,
    onActivationDiscountPercentChange,
    onCommissionPerRoundTripChange,
    onCopyAccountsChange,
    onDayStopChange,
    onEvalDiscountPercentChange,
    onLinkActivationDiscountChange,
    onMaxAttemptsChange,
    onMaxEvalDaysChange,
    onResetCoupon,
    onRiskDollarsChange,
    onRiskPercentChange,
    onRrRatioChange,
    onSeedChange,
    onSizingModeChange,
    onTradesPerDayChange,
    onTrialsChange,
    onWinrateChange,
    plan,
    riskDollars,
    riskPercent,
    rrRatio,
    seed,
    sizingMode,
    tradesPerDay,
    trials,
    winrate,
}: TradingInputsProperties) {
    const accountSize = plan.accountSize;
    const computedRisk =
        sizingMode === SizingMode.Dollar
            ? riskDollars
            : (accountSize * riskPercent) / 100;
    const otherRepresentation =
        sizingMode === SizingMode.Dollar
            ? `≈ ${formatPercent(riskDollars / accountSize, 2)} of account`
            : `≈ ${formatCurrency(computedRisk)} on $${(accountSize / 1000).toFixed(0)}K`;

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
                                    onChange={(e) =>
                                        onTrialsChange(Number(e.target.value))
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
                                    onChange={(e) =>
                                        onSeedChange(Number(e.target.value))
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
                                    onChange={(e) =>
                                        onMaxEvalDaysChange(
                                            Number(e.target.value),
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
                        onChange={(e) =>
                            onTradesPerDayChange(Number(e.target.value))
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
                        onChange={(e) =>
                            onCommissionPerRoundTripChange(
                                Number(e.target.value),
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
                        onChange={(e) =>
                            onMaxAttemptsChange(Number(e.target.value))
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
                        onChange={(e) =>
                            onCopyAccountsChange(Number(e.target.value))
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
                        onChange={(e) =>
                            onRiskDollarsChange(Number(e.target.value))
                        }
                        step={10}
                        type="number"
                        value={riskDollars}
                    />
                ) : (
                    <Input
                        max={5}
                        min={0.05}
                        onChange={(e) =>
                            onRiskPercentChange(Number(e.target.value))
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
            </div>

            <div className="border-t border-border/50 pt-4">
                <div className="mb-3 flex items-center justify-between">
                    <Eyebrow as="h4">Coupon</Eyebrow>
                    <Button
                        className="h-7 px-2 text-xs"
                        disabled={
                            evalDiscountPercent === 0 &&
                            activationDiscountPercent === 0 &&
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
                                onChange={(e) =>
                                    onEvalDiscountPercentChange(
                                        Number(e.target.value),
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
                                    onChange={(e) =>
                                        onActivationDiscountPercentChange(
                                            Number(e.target.value),
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
                </div>
            </div>
        </div>
    );
}
