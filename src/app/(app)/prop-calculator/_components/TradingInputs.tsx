'use client';

import { Settings2 } from 'lucide-react';

import { type Plan } from '~/lib/prop-calculator';
import { cn } from '~/lib/utils';

import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '~/components/ui/Popover';
import { Slider } from '~/components/ui/Slider';

import {
    formatCompactCurrency,
    formatCurrency,
    formatPercent,
} from './helpers';
import { SizingMode } from './types';

interface TradingInputsProps {
    plan: Plan;
    winrate: number;
    rrRatio: number;
    tradesPerDay: number;
    sizingMode: SizingMode;
    riskDollars: number;
    riskPercent: number;
    seed: number;
    trials: number;
    maxEvalDays: number;
    evalDiscountPercent: number;
    activationDiscountPercent: number;
    linkActivationDiscount: boolean;
    commissionPerRoundTrip: number;
    maxAttempts: number;
    copyAccounts: number;
    maxCopyAccounts: number;
    firmDisplayName: string;
    onWinrateChange: (n: number) => void;
    onRrRatioChange: (n: number) => void;
    onTradesPerDayChange: (n: number) => void;
    onSizingModeChange: (m: SizingMode) => void;
    onRiskDollarsChange: (n: number) => void;
    onRiskPercentChange: (n: number) => void;
    onSeedChange: (n: number) => void;
    onTrialsChange: (n: number) => void;
    onMaxEvalDaysChange: (n: number) => void;
    onEvalDiscountPercentChange: (n: number) => void;
    onActivationDiscountPercentChange: (n: number) => void;
    onLinkActivationDiscountChange: (linked: boolean) => void;
    onCommissionPerRoundTripChange: (n: number) => void;
    onMaxAttemptsChange: (n: number) => void;
    onCopyAccountsChange: (n: number) => void;
    onResetCoupon: () => void;
}

export default function TradingInputs({
    plan,
    winrate,
    rrRatio,
    tradesPerDay,
    sizingMode,
    riskDollars,
    riskPercent,
    seed,
    trials,
    maxEvalDays,
    evalDiscountPercent,
    activationDiscountPercent,
    linkActivationDiscount,
    commissionPerRoundTrip,
    maxAttempts,
    copyAccounts,
    maxCopyAccounts,
    firmDisplayName,
    onWinrateChange,
    onRrRatioChange,
    onTradesPerDayChange,
    onSizingModeChange,
    onRiskDollarsChange,
    onRiskPercentChange,
    onSeedChange,
    onTrialsChange,
    onMaxEvalDaysChange,
    onEvalDiscountPercentChange,
    onActivationDiscountPercentChange,
    onLinkActivationDiscountChange,
    onCommissionPerRoundTripChange,
    onMaxAttemptsChange,
    onCopyAccountsChange,
    onResetCoupon,
}: TradingInputsProps) {
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
        <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Your trading system</h3>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Advanced settings"
                        >
                            <Settings2 className="size-4" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80" align="end">
                        <div className="flex flex-col gap-3">
                            <div>
                                <label
                                    htmlFor="trials"
                                    className="mb-1 block text-xs font-medium text-muted-foreground"
                                >
                                    Monte Carlo trials
                                </label>
                                <Input
                                    id="trials"
                                    type="number"
                                    min={100}
                                    max={5000}
                                    step={100}
                                    value={trials}
                                    onChange={(e) =>
                                        onTrialsChange(Number(e.target.value))
                                    }
                                />
                            </div>
                            <div>
                                <label
                                    htmlFor="seed"
                                    className="mb-1 block text-xs font-medium text-muted-foreground"
                                >
                                    Random seed
                                </label>
                                <Input
                                    id="seed"
                                    type="number"
                                    value={seed}
                                    onChange={(e) =>
                                        onSeedChange(Number(e.target.value))
                                    }
                                />
                            </div>
                            <div>
                                <label
                                    htmlFor="max-eval-days"
                                    className="mb-1 block text-xs font-medium text-muted-foreground"
                                >
                                    Max eval days
                                </label>
                                <Input
                                    id="max-eval-days"
                                    type="number"
                                    min={10}
                                    max={365}
                                    step={5}
                                    value={maxEvalDays}
                                    onChange={(e) =>
                                        onMaxEvalDaysChange(
                                            Number(e.target.value),
                                        )
                                    }
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Trials that hit this limit count as timeouts
                                </p>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>

            <div>
                <div className="mb-2 flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">
                        Winrate
                    </label>
                    <span className="font-mono text-xs tabular-nums">
                        {formatPercent(winrate)}
                    </span>
                </div>
                <Slider
                    min={0.05}
                    max={0.95}
                    step={0.01}
                    value={[winrate]}
                    onValueChange={(v) =>
                        v[0] !== undefined && onWinrateChange(v[0])
                    }
                />
            </div>

            <div>
                <div className="mb-2 flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">
                        Reward : Risk (RR)
                    </label>
                    <span className="font-mono text-xs tabular-nums">
                        {rrRatio.toFixed(2)} : 1
                    </span>
                </div>
                <Slider
                    min={0.5}
                    max={5}
                    step={0.1}
                    value={[rrRatio]}
                    onValueChange={(v) =>
                        v[0] !== undefined && onRrRatioChange(v[0])
                    }
                />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label
                        htmlFor="trades-per-day"
                        className="mb-2 block text-xs font-medium text-muted-foreground"
                    >
                        Trades per day
                    </label>
                    <Input
                        id="trades-per-day"
                        type="number"
                        min={1}
                        max={50}
                        step={1}
                        value={tradesPerDay}
                        onChange={(e) =>
                            onTradesPerDayChange(Number(e.target.value))
                        }
                    />
                </div>
                <div>
                    <label
                        htmlFor="commission"
                        className="mb-2 block text-xs font-medium text-muted-foreground"
                    >
                        Commission ($/trade)
                    </label>
                    <Input
                        id="commission"
                        type="number"
                        min={0}
                        max={50}
                        step={0.5}
                        value={commissionPerRoundTrip}
                        onChange={(e) =>
                            onCommissionPerRoundTripChange(
                                Number(e.target.value),
                            )
                        }
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label
                        htmlFor="max-attempts"
                        className="mb-2 block text-xs font-medium text-muted-foreground"
                    >
                        Max reset attempts
                    </label>
                    <Input
                        id="max-attempts"
                        type="number"
                        min={1}
                        max={10}
                        step={1}
                        value={maxAttempts}
                        onChange={(e) =>
                            onMaxAttemptsChange(Number(e.target.value))
                        }
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
                        htmlFor="copy-accounts"
                        className="mb-2 block text-xs font-medium text-muted-foreground"
                    >
                        Copy-traded accounts
                    </label>
                    <Input
                        id="copy-accounts"
                        type="number"
                        min={1}
                        max={maxCopyAccounts}
                        step={1}
                        value={copyAccounts}
                        onChange={(e) =>
                            onCopyAccountsChange(Number(e.target.value))
                        }
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                        max {maxCopyAccounts} for {firmDisplayName}
                    </p>
                </div>
            </div>

            <div>
                <div className="mb-2 flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">
                        Risk per trade (1R)
                    </label>
                    <div className="inline-flex rounded-md border border-input p-0.5">
                        <button
                            type="button"
                            onClick={() =>
                                onSizingModeChange(SizingMode.Dollar)
                            }
                            className={cn(
                                'rounded-sm px-2 py-0.5 text-xs font-medium transition-colors',
                                sizingMode === SizingMode.Dollar
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            $
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                onSizingModeChange(SizingMode.Percent)
                            }
                            className={cn(
                                'rounded-sm px-2 py-0.5 text-xs font-medium transition-colors',
                                sizingMode === SizingMode.Percent
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            %
                        </button>
                    </div>
                </div>
                {sizingMode === SizingMode.Dollar ? (
                    <Input
                        type="number"
                        min={1}
                        max={accountSize}
                        step={10}
                        value={riskDollars}
                        onChange={(e) =>
                            onRiskDollarsChange(Number(e.target.value))
                        }
                    />
                ) : (
                    <Input
                        type="number"
                        min={0.05}
                        max={5}
                        step={0.05}
                        value={riskPercent}
                        onChange={(e) =>
                            onRiskPercentChange(Number(e.target.value))
                        }
                    />
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                    {otherRepresentation}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                    {[0.25, 0.5, 1, 2, 5].map((preset) => {
                        const active =
                            sizingMode === SizingMode.Percent &&
                            Math.abs(riskPercent - preset) < 0.01;
                        return (
                            <button
                                key={preset}
                                type="button"
                                onClick={() => {
                                    onSizingModeChange(SizingMode.Percent);
                                    onRiskPercentChange(preset);
                                }}
                                className={cn(
                                    'rounded-md border border-input px-2 py-0.5 text-[11px] font-medium transition-colors',
                                    active
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {preset}%
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="border-t border-border/50 pt-4">
                <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        Coupon
                    </h4>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={onResetCoupon}
                        disabled={
                            evalDiscountPercent === 0 &&
                            activationDiscountPercent === 0 &&
                            !linkActivationDiscount
                        }
                    >
                        Reset
                    </Button>
                </div>

                <div className="flex flex-col gap-3">
                    <div>
                        <div className="mb-1 flex items-center justify-between">
                            <label
                                htmlFor="eval-discount"
                                className="text-xs font-medium text-muted-foreground"
                            >
                                Eval fee discount
                            </label>
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                                {plan.fees.oneTimeEval > 0
                                    ? `${formatCompactCurrency(
                                          plan.fees.oneTimeEval,
                                      )} → ${formatCompactCurrency(
                                          plan.fees.oneTimeEval *
                                              (1 - evalDiscountPercent / 100),
                                      )}`
                                    : 'no eval fee'}
                            </span>
                        </div>
                        <div className="relative">
                            <Input
                                id="eval-discount"
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                value={evalDiscountPercent}
                                onChange={(e) =>
                                    onEvalDiscountPercentChange(
                                        Number(e.target.value),
                                    )
                                }
                                className="pr-7"
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                                %
                            </span>
                        </div>
                    </div>

                    <div>
                        <div className="mb-1 flex items-center justify-between">
                            <label
                                htmlFor="activation-discount"
                                className="text-xs font-medium text-muted-foreground"
                            >
                                Activation fee discount
                            </label>
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                                {plan.fees.activation > 0
                                    ? `${formatCompactCurrency(
                                          plan.fees.activation,
                                      )} → ${formatCompactCurrency(
                                          plan.fees.activation *
                                              (1 -
                                                  (linkActivationDiscount
                                                      ? evalDiscountPercent
                                                      : activationDiscountPercent) /
                                                      100),
                                      )}`
                                    : 'no activation fee'}
                            </span>
                        </div>
                        <div className="flex items-stretch gap-2">
                            <div className="relative flex-1">
                                <Input
                                    id="activation-discount"
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={1}
                                    value={
                                        linkActivationDiscount
                                            ? evalDiscountPercent
                                            : activationDiscountPercent
                                    }
                                    disabled={
                                        plan.fees.activation === 0 ||
                                        linkActivationDiscount
                                    }
                                    onChange={(e) =>
                                        onActivationDiscountPercentChange(
                                            Number(e.target.value),
                                        )
                                    }
                                    className="pr-7"
                                />
                                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                                    %
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() =>
                                    onLinkActivationDiscountChange(
                                        !linkActivationDiscount,
                                    )
                                }
                                disabled={plan.fees.activation === 0}
                                className={cn(
                                    'rounded-md border border-input px-2 text-xs font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50',
                                    linkActivationDiscount
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                                aria-pressed={linkActivationDiscount}
                            >
                                Match eval
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
