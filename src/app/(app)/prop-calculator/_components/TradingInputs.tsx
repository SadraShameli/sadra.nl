'use client';

import { Settings2 } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';

import { CALCULATOR_FIELD_LABELS } from '~/app/(app)/prop-calculator/_components/calculatorFieldLabels';
import Eyebrow from '~/components/Eyebrow';
import { Button } from '~/components/ui/Button';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '~/components/ui/Field';
import { Input } from '~/components/ui/Input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '~/components/ui/Popover';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import { Separator } from '~/components/ui/Separator';
import { Slider } from '~/components/ui/Slider';
import { Toggle } from '~/components/ui/Toggle';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/ToggleGroup';
import {
    formatCurrency,
    formatGateCurrency,
    formatPercent,
} from '~/lib/format';
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
    type EdgePlausibilityNoteInputs,
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
import { PercentInput } from './PercentInput';
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
const RISK_INPUT_ID = 'risk-per-trade';
const COUPON_HEADING_ID = 'coupon-heading';
const INSTRUMENT_NOT_ENFORCED = 'not-enforced';
export const PLAUSIBILITY_NOTE_ID = 'plausibility-note';
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

export function compoundStartDollarsOf(text: string): number | undefined {
    const start = Number(text.replaceAll(',', '').trim());
    return text.trim() !== '' && Number.isFinite(start) && start > 0
        ? start
        : undefined;
}

export function tradingEdgePlausibilityNote(
    winrate: number,
    rrRatio: number,
    thresholds: PlausibilityThresholds = DEFAULT_RULEBOOK.plausibility,
    pace: Pick<
        EdgePlausibilityNoteInputs,
        'compoundStartDollars' | 'tradesPerDay'
    > = {},
): null | string {
    return edgePlausibilityNoteText(
        { ...pace, rrRatio, winrate: fraction(winrate) },
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
    const [compoundStartText, setCompoundStartText] = useState('');
    const [committedCompoundStartText, setCommittedCompoundStartText] =
        useState('');
    const [heldTradesPerDay, setHeldTradesPerDay] = useState<null | number>(
        null,
    );
    const plausibilityNote = tradingEdgePlausibilityNote(
        winrate,
        rrRatio,
        DEFAULT_RULEBOOK.plausibility,
        {
            compoundStartDollars: compoundStartDollarsOf(
                committedCompoundStartText,
            ),
            tradesPerDay: heldTradesPerDay ?? tradesPerDay,
        },
    );
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
                        <FieldGroup className="gap-4">
                            <Field>
                                <FieldLabel htmlFor="trials">
                                    Monte Carlo trials
                                </FieldLabel>
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
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="seed">
                                    Random seed
                                </FieldLabel>
                                <Input
                                    id="seed"
                                    onChange={(event) =>
                                        onSeedChange(Number(event.target.value))
                                    }
                                    type="number"
                                    value={seed}
                                />
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="max-eval-days">
                                    Max eval days
                                </FieldLabel>
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
                                <FieldDescription>
                                    {inputHints.maxEvalDays}
                                </FieldDescription>
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="day-stop-rule">
                                    Day-stop rule
                                </FieldLabel>
                                <DayStopRulePicker
                                    id="day-stop-rule"
                                    onChange={onDayStopChange}
                                    value={dayStop}
                                />
                                <FieldDescription>
                                    Cap intraday trading: stop after first win,
                                    K losses, or a $ target.
                                </FieldDescription>
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="retained-cushion">
                                    {
                                        CALCULATOR_FIELD_LABELS.retainedCushionRequest
                                    }
                                </FieldLabel>
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
                                    value={retainedCushion?.toString() ?? ''}
                                />
                                <FieldDescription>
                                    How far above the drawdown floor a simulated
                                    payout stops short. Floored at the
                                    plan&apos;s full funded drawdown (
                                    {formatCurrency(
                                        plan.defaultRetainedCushion(),
                                    )}
                                    ). No real trader drains cushion to the edge
                                    on every withdrawal, so a lower value is
                                    clamped up to this floor.
                                </FieldDescription>
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="payout-request-size">
                                    {
                                        CALCULATOR_FIELD_LABELS.payoutRequestOverride
                                    }
                                </FieldLabel>
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
                                    value={payoutRequestSize?.toString() ?? ''}
                                />
                                <FieldDescription>
                                    How much to withdraw per payout. Empty means
                                    withdraw everything above the retained
                                    cushion.
                                </FieldDescription>
                            </Field>
                            {earlyWithdrawal === null ? null : (
                                <Field>
                                    <FieldLabel htmlFor="one-time-early-withdrawal">
                                        One-time early withdrawal
                                    </FieldLabel>
                                    <Toggle
                                        className="w-fit"
                                        id="one-time-early-withdrawal"
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
                                    <FieldDescription>
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
                                    </FieldDescription>
                                </Field>
                            )}
                            {fundedReset === null ? null : (
                                <Field>
                                    <FieldLabel htmlFor="funded-reset">
                                        {fundedReset.label}
                                    </FieldLabel>
                                    <Toggle
                                        className="w-fit"
                                        id="funded-reset"
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
                                    <FieldDescription>
                                        {describeFundedReset(fundedReset)} The
                                        reset discount applies. Off by default.
                                    </FieldDescription>
                                </Field>
                            )}
                            <Field>
                                <FieldLabel htmlFor="idle-day-probability">
                                    Idle-day probability
                                </FieldLabel>
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
                                <FieldDescription>
                                    Chance any given day has zero trades. Only
                                    matters for plans with a modeled
                                    inactivity-closure rule (e.g. MFFU Rapid
                                    EOD).
                                </FieldDescription>
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="live-transfer-hazard">
                                    Live-transfer hazard per paid payout
                                </FieldLabel>
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
                                <FieldDescription>
                                    The chance, after each paid payout, that the
                                    firm sends the account live, which ends its
                                    simulated payouts. It is your assumption,
                                    not a firm rule. 0 leaves transfers
                                    unpriced, as before. Only the strategy lab
                                    uses it; the results, sizing, compare and
                                    the other tools stay unpriced. In the lab, a
                                    scenario with an instrument and stop points
                                    on a plan with a verified live plan
                                    continues the account through it; otherwise
                                    the rest of a transferred account is valued
                                    at $0.
                                </FieldDescription>
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="rung-sizing">
                                    {UNAFFORDABLE_RUNG_LABEL}
                                </FieldLabel>
                                <Select
                                    onValueChange={(value) => {
                                        const parsed =
                                            rungSizingSchema.safeParse(value);
                                        if (parsed.success) {
                                            onRungSizingChange(parsed.data);
                                        }
                                    }}
                                    value={rungSizing}
                                >
                                    <SelectTrigger id="rung-sizing">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {RUNG_SIZING_OPTIONS.map((option) => (
                                            <SelectItem
                                                key={option}
                                                value={option}
                                            >
                                                {RUNG_SIZING_LABELS[option]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        </FieldGroup>
                    </PopoverContent>
                </Popover>
            </div>

            <Field>
                <div className="flex items-center justify-between">
                    <FieldLabel id="winrate-label">Winrate</FieldLabel>
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
            </Field>

            <Field>
                <div className="flex items-center justify-between">
                    <FieldLabel id="rr-ratio-label">
                        Reward : Risk (RR)
                    </FieldLabel>
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
                <FieldDescription
                    className="text-amber-400"
                    id={PLAUSIBILITY_NOTE_ID}
                    role="status"
                >
                    {plausibilityNote ?? ''}
                </FieldDescription>
            </Field>
            {plausibilityNote !== null && (
                <Field>
                    <FieldLabel htmlFor="compounding-start">
                        Compounding start ($)
                    </FieldLabel>
                    <Input
                        aria-describedby={PLAUSIBILITY_NOTE_ID}
                        id="compounding-start"
                        inputMode="decimal"
                        onBlur={() => {
                            setCommittedCompoundStartText(compoundStartText);
                        }}
                        onChange={(event) => {
                            setCompoundStartText(event.target.value);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                setCommittedCompoundStartText(
                                    compoundStartText,
                                );
                            }
                        }}
                        placeholder="optional, Enter to apply"
                        type="text"
                        value={compoundStartText}
                    />
                </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
                <Field>
                    <FieldLabel htmlFor="trades-per-day">
                        Trades per day
                    </FieldLabel>
                    <Input
                        aria-describedby={PLAUSIBILITY_NOTE_ID}
                        id="trades-per-day"
                        max={50}
                        min={1}
                        onBlur={() => {
                            setHeldTradesPerDay(null);
                        }}
                        onChange={(event) => {
                            setHeldTradesPerDay((held) => held ?? tradesPerDay);
                            onTradesPerDayChange(Number(event.target.value));
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                setHeldTradesPerDay(null);
                            }
                        }}
                        step={1}
                        type="number"
                        value={tradesPerDay}
                    />
                </Field>
                <Field>
                    <FieldLabel htmlFor="commission">
                        Commission ($/trade)
                    </FieldLabel>
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
                        value={
                            commissionPerRoundTrip === 0 ||
                            Number.isNaN(commissionPerRoundTrip)
                                ? ''
                                : commissionPerRoundTrip
                        }
                    />
                </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <Field>
                    <FieldLabel htmlFor="max-attempts">
                        Max reset attempts
                    </FieldLabel>
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
                        <FieldDescription>{retryNote}</FieldDescription>
                    )}
                </Field>
                <Field>
                    <FieldLabel htmlFor="copy-accounts">
                        Copy-traded accounts
                    </FieldLabel>
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
                    <FieldDescription>
                        max {maxCopyAccounts} for {firmDisplayName}
                    </FieldDescription>
                </Field>
            </div>

            <Field data-invalid={sizingRefusal !== null}>
                <div className="flex items-center justify-between">
                    <FieldLabel htmlFor={RISK_INPUT_ID}>
                        Risk per trade (1R)
                    </FieldLabel>
                    <ToggleGroup
                        aria-label="Risk unit"
                        className="w-auto"
                        onValueChange={(v: string) => {
                            const parsed = sizingModeSchema.safeParse(v);
                            if (parsed.success) onSizingModeChange(parsed.data);
                        }}
                        size="sm"
                        type="single"
                        value={sizingMode}
                        variant="outline"
                    >
                        <ToggleGroupItem value={SizingMode.Dollar}>
                            $
                        </ToggleGroupItem>
                        <ToggleGroupItem value={SizingMode.Percent}>
                            %
                        </ToggleGroupItem>
                    </ToggleGroup>
                </div>
                {sizingMode === SizingMode.Dollar ? (
                    <Input
                        {...riskInputAria}
                        id={RISK_INPUT_ID}
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
                        id={RISK_INPUT_ID}
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
                <FieldDescription>{otherRepresentation}</FieldDescription>
                <div className="flex flex-wrap gap-1">
                    {[0.25, 0.5, 1, 2, 5].map((preset) => {
                        const isActive =
                            sizingMode === SizingMode.Percent &&
                            Math.abs(riskPercent - preset) < 0.01;
                        return (
                            <Button
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
            </Field>
            <div className="grid grid-cols-2 gap-3">
                <Field>
                    <FieldLabel htmlFor="position-sizing-instrument">
                        {CALCULATOR_FIELD_LABELS.instrument}
                    </FieldLabel>
                    <Select
                        onValueChange={(value) => {
                            if (value === INSTRUMENT_NOT_ENFORCED) {
                                onInstrumentChange(null);
                                return;
                            }
                            const parsed =
                                instrumentSymbolSchema.safeParse(value);
                            if (parsed.success) {
                                onInstrumentChange(parsed.data);
                            }
                        }}
                        value={instrument ?? INSTRUMENT_NOT_ENFORCED}
                    >
                        <SelectTrigger id="position-sizing-instrument">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={INSTRUMENT_NOT_ENFORCED}>
                                Not enforced
                            </SelectItem>
                            {ALL_INSTRUMENTS.map((spec) => (
                                <SelectItem
                                    key={spec.symbol}
                                    value={spec.symbol}
                                >
                                    {spec.symbol} (
                                    {formatGateCurrency(spec.pointValue)}/pt)
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
                {instrument === null ? null : (
                    <Field data-invalid={sizingRefusal !== null}>
                        <FieldLabel htmlFor="position-sizing-stop">
                            {CALCULATOR_FIELD_LABELS.stopPoints}
                        </FieldLabel>
                        <Input
                            {...riskInputAria}
                            id="position-sizing-stop"
                            min={0.25}
                            onChange={(event) =>
                                onStopPointsChange(Number(event.target.value))
                            }
                            step={0.25}
                            type="number"
                            value={stopPoints ?? ''}
                        />
                    </Field>
                )}
            </div>
            {instrument === null || stopPoints === null ? null : (
                <FieldDescription>
                    {isRiskCappedByContracts
                        ? `Capped to ${formatCurrency(feasibleRisk)}/trade in eval - ${evalContractCap ?? '?'} ${positionSizingSpec?.isMicro ? 'micro' : 'mini'} contract limit at a ${stopPoints}pt stop`
                        : `Fits within the eval contract limit at a ${stopPoints}pt stop`}
                </FieldDescription>
            )}
            {isSizingHintShown ? (
                <div className="flex flex-col gap-1" id={SIZING_HINT_ID}>
                    {placedRisk === null ? null : (
                        <FieldDescription>
                            {describePlacedFundedRisk(placedRisk)}
                        </FieldDescription>
                    )}
                    {sizingRefusal === null ? null : (
                        <FieldError>{sizingRefusal}</FieldError>
                    )}
                </div>
            ) : null}

            <Separator />
            <section
                aria-labelledby={COUPON_HEADING_ID}
                className="flex flex-col gap-3"
            >
                <div className="flex items-center justify-between">
                    <Eyebrow as="h4" id={COUPON_HEADING_ID}>
                        Coupon
                    </Eyebrow>
                    <Button
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

                <FieldGroup className="gap-4">
                    <Field>
                        <div className="flex items-center justify-between">
                            <FieldLabel htmlFor="eval-discount">
                                Eval fee discount
                            </FieldLabel>
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                                {describeEvalFee(plan.fees, purchaseDiscounts)}
                            </span>
                        </div>
                        <PercentInput
                            id="eval-discount"
                            onChange={onEvalDiscountPercentChange}
                            value={evalDiscountPercent}
                        />
                        <FieldDescription>
                            {EVAL_DISCOUNT_REBUY_NOTE}
                        </FieldDescription>
                    </Field>

                    <Field
                        data-disabled={
                            plan.fees.activation === 0 || linkActivationDiscount
                        }
                    >
                        <div className="flex items-center justify-between">
                            <FieldLabel htmlFor="activation-discount">
                                Activation fee discount
                            </FieldLabel>
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                                {describeActivationFee(
                                    plan.fees,
                                    purchaseDiscounts,
                                )}
                            </span>
                        </div>
                        <div className="flex items-stretch gap-2">
                            <PercentInput
                                id="activation-discount"
                                isDisabled={
                                    plan.fees.activation === 0 ||
                                    linkActivationDiscount
                                }
                                onChange={onActivationDiscountPercentChange}
                                value={
                                    linkActivationDiscount
                                        ? evalDiscountPercent
                                        : activationDiscountPercent
                                }
                            />
                            <Toggle
                                className="whitespace-nowrap"
                                disabled={plan.fees.activation === 0}
                                onPressedChange={onLinkActivationDiscountChange}
                                pressed={linkActivationDiscount}
                                size="sm"
                                variant="outline"
                            >
                                Match eval
                            </Toggle>
                        </div>
                    </Field>

                    <Field data-disabled={plan.fees.monthlySubscription === 0}>
                        <div className="flex items-center justify-between">
                            <FieldLabel htmlFor="monthly-subscription-discount">
                                Monthly subscription discount
                            </FieldLabel>
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                                {describeMonthlySubscriptionFee(
                                    plan.fees,
                                    purchaseDiscounts,
                                )}
                            </span>
                        </div>
                        <PercentInput
                            id="monthly-subscription-discount"
                            isDisabled={plan.fees.monthlySubscription === 0}
                            onChange={
                                onMonthlySubscriptionDiscountPercentChange
                            }
                            value={monthlySubscriptionDiscountPercent}
                        />
                    </Field>

                    <Field data-disabled={!hasResetOption(plan.fees)}>
                        <div className="flex items-center justify-between">
                            <FieldLabel htmlFor="reset-discount">
                                Reset fee discount
                            </FieldLabel>
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                                {describeResetFee(plan.fees, purchaseDiscounts)}
                            </span>
                        </div>
                        <PercentInput
                            id="reset-discount"
                            isDisabled={!hasResetOption(plan.fees)}
                            onChange={onResetDiscountPercentChange}
                            value={resetDiscountPercent}
                        />
                    </Field>
                </FieldGroup>
            </section>
        </div>
    );
}
