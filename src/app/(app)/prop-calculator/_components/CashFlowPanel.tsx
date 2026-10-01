'use client';

import { useState } from 'react';
import { z } from 'zod';

import { Button } from '~/components/ui/Button';
import { Card } from '~/components/ui/Card';
import InfoPopover from '~/components/ui/InfoPopover';
import { Input } from '~/components/ui/Input';
import {
    formatCompactCurrency,
    formatPercent,
    NOT_APPLICABLE,
} from '~/lib/format';
import {
    dollars,
    floorToWholeCents,
    fraction,
    type SimInputs,
    TRADING_DAYS_PER_YEAR,
} from '~/lib/prop-calculator';
import { funnelWhatIf, type FunnelWhatIf } from '~/lib/prop-calculator/economics';
import { median } from '~/lib/prop-calculator/stats';
import { cn } from '~/lib/utilities';

import { cashFlowRoiOnSpend } from './cashFlowRoi';
import BreakevenMonthHistogramView from './charts/BreakevenMonthHistogramView';
import CashFlowBandChartView from './charts/CashFlowBandChartView';
import CashFlowPaybackChartView from './charts/CashFlowPaybackChartView';
import { clampInt } from './clamp';
import { KPI_ACCENT_TEXT_CLASS } from './kpiAccent';
import { panelDescriptions } from './kpiDescriptions';
import { SimulationFailureNotice } from './SimulationFailureNotice';
import StatCard from './StatCard';
import {
    CASH_FLOW_MAX_TRADES_PER_DAY,
    useCashFlowSimulation,
} from './useCashFlowSimulation';

interface CashFlowPanelProperties {
    baseInputs: SimInputs;
    firmDisplayName: string;
    maxAccounts: number;
}

const HORIZON_OPTIONS = [
    { days: TRADING_DAYS_PER_YEAR / 2, label: '6 months' },
    { days: TRADING_DAYS_PER_YEAR, label: '1 year' },
    { days: TRADING_DAYS_PER_YEAR * 2, label: '2 years' },
    { days: TRADING_DAYS_PER_YEAR * 3, label: '3 years' },
] as const;

const DEFAULT_ACCOUNTS = 5;
const MAX_ACCOUNTS = 10;
const MIN_ACCOUNTS = 1;
const DEFAULT_TRIALS = 150;
const MAX_TRIALS = 300;
const MIN_TRIALS = 25;

const WHAT_IF_VALIDATION_MESSAGE =
    'enter a valid pass rate, payout rate, attempts, average payout and attempt cost';
const WHAT_IF_VALIDATION_MESSAGE_ID = 'cash-flow-what-if-validation-message';

export interface FunnelWhatIfFormValues {
    attemptCost: string;
    attempts: string;
    averagePayout: string;
    passRate: string;
    payoutRate: string;
}

const EMPTY_WHAT_IF_FORM: FunnelWhatIfFormValues = {
    attemptCost: '',
    attempts: '',
    averagePayout: '',
    passRate: '',
    payoutRate: '',
};

const percentField = z.coerce.number().min(0).max(100);

const funnelWhatIfFormSchema = z.object({
    attemptCost: z.coerce.number().nonnegative().transform(floorToWholeCents),
    attempts: z.coerce.number().int().positive(),
    averagePayout: z.coerce.number().nonnegative().transform(floorToWholeCents),
    passRate: percentField,
    payoutRate: percentField,
});

export default function CashFlowPanel({
    baseInputs,
    firmDisplayName,
    maxAccounts,
}: CashFlowPanelProperties) {
    const {
        commissionPerRoundTrip,
        dayStop,
        discounts,
        evalDayPolicy,
        instrument,
        maxEvalDays,
        minRetainedCushion,
        payoutRequestSize,
        plan,
        riskPerTrade,
        rrRatio,
        rungSizing,
        seed,
        stopPoints,
        tradesPerDay,
        winrate,
    } = baseInputs;
    const [horizonIndex, setHorizonIndex] = useState(1);
    const [accounts, setAccounts] = useState(DEFAULT_ACCOUNTS);
    const [trials, setTrials] = useState(DEFAULT_TRIALS);
    const [whatIfForm, setWhatIfForm] = useState<FunnelWhatIfFormValues>(EMPTY_WHAT_IF_FORM);

    const horizon = HORIZON_OPTIONS[horizonIndex] ?? HORIZON_OPTIONS[0];
    const accountCap = Math.min(MAX_ACCOUNTS, maxAccounts);
    const effectiveAccounts = clampInt(
        accounts,
        MIN_ACCOUNTS,
        accountCap,
        MIN_ACCOUNTS,
    );

    const {
        effectiveTradesPerDay,
        error,
        isTradesPerDayCapped,
        pending,
        result,
    } = useCashFlowSimulation({
        accounts: effectiveAccounts,
        commissionPerRoundTrip,
        dayBudget: horizon.days,
        dayStop,
        discounts,
        evalDayPolicy,
        instrument,
        maxEvalDays,
        minRetainedCushion,
        payoutRequestSize,
        plan,
        riskPerTrade,
        rrRatio,
        rungSizing,
        seed,
        stopPoints,
        tradesPerDay,
        trials,
        winrate,
    });

    const finalNet50 = result?.netP50.at(-1) ?? 0;
    const finalNet10 = result?.netP10.at(-1) ?? 0;
    const finalNet90 = result?.netP90.at(-1) ?? 0;
    const finalSpend50 = result?.spendP50.at(-1) ?? 0;
    const pFinalNetNegative = result?.pFinalNetNegative ?? 0;
    const pEverBreakEven = result?.pEverCashflowPositive ?? 0;
    const isWhatIfFilled = [
        whatIfForm.attemptCost,
        whatIfForm.attempts,
        whatIfForm.averagePayout,
        whatIfForm.passRate,
        whatIfForm.payoutRate,
    ].every((value) => value.trim() !== '');
    const whatIf = isWhatIfFilled ? funnelWhatIfFromForm(whatIfForm) : null;
    const isWhatIfInvalid = isWhatIfFilled && whatIf === null;
    const medianBreakEvenMonth =
        result && result.breakEvenMonthValues.length > 0
            ? median(result.breakEvenMonthValues)
            : null;
    const roiOnSpend = cashFlowRoiOnSpend(finalNet50, finalSpend50);

    return (
        <Card className={cn('app-prop-calculator__cash-flow', 'px-5 py-5')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">
                        Cash Flow Over Time
                    </h3>
                    <InfoPopover title="Cash Flow Over Time">
                        {panelDescriptions.cashFlow}
                    </InfoPopover>
                </div>
                <div className="flex gap-2">
                    {HORIZON_OPTIONS.map((h, index) => (
                        <Button
                            className="h-7 px-2.5 text-xs"
                            key={h.label}
                            onClick={() => setHorizonIndex(index)}
                            size="sm"
                            type="button"
                            variant={
                                index === horizonIndex ? 'default' : 'ghost'
                            }
                        >
                            {h.label}
                        </Button>
                    ))}
                </div>
            </div>

            <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-end gap-4">
                    <div>
                        <label
                            className="mb-1 block text-[11px] text-muted-foreground"
                            htmlFor="cash-flow-accounts"
                        >
                            Accounts (max {accountCap})
                        </label>
                        <Input
                            className="h-7 w-20 text-xs"
                            id="cash-flow-accounts"
                            max={accountCap}
                            min={MIN_ACCOUNTS}
                            onChange={(event) =>
                                setAccounts(
                                    clampInt(
                                        Number(event.target.value),
                                        MIN_ACCOUNTS,
                                        accountCap,
                                        MIN_ACCOUNTS,
                                    ),
                                )
                            }
                            step={1}
                            type="number"
                            value={effectiveAccounts}
                        />
                    </div>
                    <div>
                        <label
                            className="mb-1 block text-[11px] text-muted-foreground"
                            htmlFor="cash-flow-trials"
                        >
                            Trials
                        </label>
                        <Input
                            className="h-7 w-20 text-xs"
                            id="cash-flow-trials"
                            max={MAX_TRIALS}
                            min={MIN_TRIALS}
                            onChange={(event) =>
                                setTrials(
                                    clampInt(
                                        Number(event.target.value),
                                        MIN_TRIALS,
                                        MAX_TRIALS,
                                        MIN_TRIALS,
                                    ),
                                )
                            }
                            step={25}
                            type="number"
                            value={trials}
                        />
                    </div>
                    <span className="pb-1.5 text-[11px] text-muted-foreground">
                        {pending
                            ? 'computing…'
                            : 'independent of the global trial/account settings above'}
                    </span>
                </div>

                {maxAccounts < MAX_ACCOUNTS && (
                    <p className="text-[11px] text-muted-foreground">
                        {firmDisplayName} allows at most {maxAccounts} funded
                        account(s) at once on this plan
                    </p>
                )}

                {isTradesPerDayCapped && (
                    <p className="text-[11px] text-amber-400">
                        Capped at {CASH_FLOW_MAX_TRADES_PER_DAY} effective
                        trades/day for this panel (global setting is{' '}
                        {tradesPerDay}): this simulation runs entirely on the
                        main thread, so its own worst case has to stay bounded
                        independently of the slider above.
                    </p>
                )}

                {error === null ? (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                        <StatCard
                            label="Median final net"
                            sub={`through ${horizon.label}`}
                            value={formatCompactCurrency(finalNet50)}
                            valueClassName={
                                finalNet50 >= 0
                                    ? 'text-emerald-400'
                                    : 'text-rose-400'
                            }
                        />
                        <StatCard
                            label="P10 final net"
                            sub="10th percentile outcome"
                            value={formatCompactCurrency(finalNet10)}
                        />
                        <StatCard
                            label="P(ends net negative)"
                            sub="share of trials with a negative final net"
                            value={formatPercent(pFinalNetNegative)}
                        />
                        <StatCard
                            label="P90 final net"
                            sub="90th percentile outcome"
                            value={formatCompactCurrency(finalNet90)}
                        />
                        <StatCard
                            label="Median break-even"
                            sub="month net turns positive"
                            value={
                                medianBreakEvenMonth === null
                                    ? NOT_APPLICABLE
                                    : `${medianBreakEvenMonth.toFixed(1)}mo`
                            }
                            valueClassName={
                                medianBreakEvenMonth === null
                                    ? 'text-muted-foreground'
                                    : 'text-emerald-400'
                            }
                        />
                        <StatCard
                            label="P(ever break-even)"
                            sub="within the horizon"
                            value={formatPercent(pEverBreakEven)}
                            valueClassName={
                                pEverBreakEven >= 0.5
                                    ? 'text-emerald-400'
                                    : 'text-amber-400'
                            }
                        />
                        <StatCard
                            label="ROI on spend"
                            sub="median final net ÷ median spend"
                            value={roiOnSpend.text}
                            valueClassName={
                                KPI_ACCENT_TEXT_CLASS[roiOnSpend.accent]
                            }
                        />
                    </div>
                ) : null}

                {result ? (
                    <>
                        <CashFlowBandChartView result={result} />
                        <p className="text-[11px] text-muted-foreground">
                            {trials} trials × {result.accountsSimulated}{' '}
                            accounts · {effectiveTradesPerDay} trades/day ·
                            shaded band: P10–P90 · bold line: median net
                        </p>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="flex min-w-0 flex-col gap-2">
                                <p className="text-xs font-medium text-muted-foreground">
                                    Spend vs payout (median)
                                </p>
                                <CashFlowPaybackChartView result={result} />
                                <p className="text-[11px] text-muted-foreground">
                                    <span className="text-rose-400">■</span>{' '}
                                    Cumulative spend ·{' '}
                                    <span className="text-emerald-400">■</span>{' '}
                                    Cumulative payout
                                </p>
                            </div>
                            <div className="flex min-w-0 flex-col gap-2">
                                <p className="text-xs font-medium text-muted-foreground">
                                    Break-even month distribution
                                </p>
                                <BreakevenMonthHistogramView result={result} />
                            </div>
                        </div>
                    </>
                ) : error === null ? (
                    <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                        Computing cash flow…
                    </div>
                ) : (
                    <SimulationFailureNotice message={error} />
                )}

                <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
                    <p className="text-xs font-medium text-muted-foreground">
                        What-if funnel (attempts, pass rate, payout rate, payout, fee)
                    </p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                        <WhatIfField
                            id="cash-flow-what-if-attempts"
                            invalid={isWhatIfInvalid}
                            label="Attempts"
                            onChange={(value) =>
                                setWhatIfForm((current) => ({ ...current, attempts: value }))
                            }
                            value={whatIfForm.attempts}
                        />
                        <WhatIfField
                            id="cash-flow-what-if-pass-rate"
                            invalid={isWhatIfInvalid}
                            label="Pass rate (%)"
                            onChange={(value) =>
                                setWhatIfForm((current) => ({ ...current, passRate: value }))
                            }
                            value={whatIfForm.passRate}
                        />
                        <WhatIfField
                            id="cash-flow-what-if-payout-rate"
                            invalid={isWhatIfInvalid}
                            label="Payout rate given funded (%)"
                            onChange={(value) =>
                                setWhatIfForm((current) => ({ ...current, payoutRate: value }))
                            }
                            value={whatIfForm.payoutRate}
                        />
                        <WhatIfField
                            id="cash-flow-what-if-average-payout"
                            invalid={isWhatIfInvalid}
                            label="Average payout ($)"
                            onChange={(value) =>
                                setWhatIfForm((current) => ({
                                    ...current,
                                    averagePayout: value,
                                }))
                            }
                            value={whatIfForm.averagePayout}
                        />
                        <WhatIfField
                            id="cash-flow-what-if-attempt-cost"
                            invalid={isWhatIfInvalid}
                            label="Attempt cost ($)"
                            onChange={(value) =>
                                setWhatIfForm((current) => ({
                                    ...current,
                                    attemptCost: value,
                                }))
                            }
                            value={whatIfForm.attemptCost}
                        />
                    </div>
                    {isWhatIfInvalid ? (
                        <p className="text-[11px] text-rose-400" id={WHAT_IF_VALIDATION_MESSAGE_ID}>
                            {WHAT_IF_VALIDATION_MESSAGE}
                        </p>
                    ) : whatIf === null ? null : (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                            <StatCard label="Passed" value={whatIf.passed.toFixed(1)} />
                            <StatCard label="Paid" value={whatIf.paid.toFixed(1)} />
                            <StatCard
                                label="Fees"
                                value={formatCompactCurrency(whatIf.fees)}
                            />
                            <StatCard
                                label="Payouts"
                                value={formatCompactCurrency(whatIf.payouts)}
                            />
                            <StatCard
                                label="Net"
                                value={formatCompactCurrency(whatIf.net)}
                                valueClassName={whatIf.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}
                            />
                            <StatCard
                                label="Payout multiple"
                                value={
                                    whatIf.payoutMultiple.value === null
                                        ? NOT_APPLICABLE
                                        : `${whatIf.payoutMultiple.value.toFixed(2)}:1`
                                }
                            />
                        </div>
                    )}
                </div>
            </div>
        </Card>
    );
}

export function funnelWhatIfFromForm(values: FunnelWhatIfFormValues): FunnelWhatIf | null {
    const parsed = funnelWhatIfFormSchema.safeParse(values);
    if (!parsed.success) return null;
    const result = funnelWhatIf({
        attemptCost: dollars(parsed.data.attemptCost),
        attempts: parsed.data.attempts,
        averagePayout: dollars(parsed.data.averagePayout),
        passProbability: fraction(parsed.data.passRate / 100),
        payoutProbabilityGivenFunded: fraction(parsed.data.payoutRate / 100),
    });
    return result.value;
}

function WhatIfField({
    id,
    invalid = false,
    label,
    onChange,
    value,
}: {
    id: string;
    invalid?: boolean;
    label: string;
    onChange: (raw: string) => void;
    value: string;
}) {
    return (
        <div className="flex flex-col gap-1">
            <label className="text-[11px] text-muted-foreground" htmlFor={id}>
                {label}
            </label>
            <Input
                aria-describedby={invalid ? WHAT_IF_VALIDATION_MESSAGE_ID : undefined}
                aria-invalid={invalid}
                className="h-7 text-xs"
                id={id}
                inputMode="decimal"
                onChange={(event) => onChange(event.target.value)}
                type="number"
                value={value}
            />
        </div>
    );
}
