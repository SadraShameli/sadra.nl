'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { z } from 'zod';

import { Input } from '~/components/ui/Input';
import { formatCompactCurrency, NOT_APPLICABLE } from '~/lib/format';
import { dollars, floorToWholeCents, fraction } from '~/lib/prop-calculator';
import {
    attemptEconomics,
    ECONOMICS_DISCLOSURE_TEXT,
    type EconomicsDisclosure,
    fundedValueFrom,
    funnelWhatIf,
    type FunnelWhatIf,
} from '~/lib/prop-calculator/economics';

import StatCard from './StatCard';

const WHAT_IF_VALIDATION_MESSAGE =
    'enter a valid pass rate, payout rate, attempts, average payout and attempt cost';
const WHAT_IF_VALIDATION_MESSAGE_ID = 'cash-flow-what-if-validation-message';

export interface FunnelWhatIfFormResult {
    disclosures: readonly EconomicsDisclosure[];
    fundedValueToAttemptCostLabel: null | string;
    result: FunnelWhatIf;
}

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

const numericText = z.string().transform(Number);

const percentField = numericText.pipe(z.number().min(0).max(100));

const funnelWhatIfFormSchema = z.object({
    attemptCost: numericText
        .pipe(z.number().nonnegative())
        .transform(floorToWholeCents),
    attempts: numericText.pipe(z.number().int().positive()),
    averagePayout: numericText
        .pipe(z.number().nonnegative())
        .transform(floorToWholeCents),
    passRate: percentField,
    payoutRate: percentField,
});

export function funnelWhatIfFromForm(
    values: FunnelWhatIfFormValues,
): FunnelWhatIfFormResult | null {
    const parsed = funnelWhatIfFormSchema.safeParse(values);
    if (!parsed.success) return null;
    const attemptCost = dollars(parsed.data.attemptCost);
    const averagePayout = dollars(parsed.data.averagePayout);
    const passProbability = fraction(parsed.data.passRate / 100);
    const payoutProbabilityGivenFunded = fraction(parsed.data.payoutRate / 100);
    const funnel = funnelWhatIf({
        attemptCost,
        attempts: parsed.data.attempts,
        averagePayout,
        passProbability,
        payoutProbabilityGivenFunded,
    });
    if (funnel.value === null) return null;
    const fundedValue = fundedValueFrom({
        averagePayout,
        payoutProbabilityGivenFunded,
        payoutsPerPaidFunded: 1,
    });
    const economics =
        fundedValue.value === null
            ? null
            : attemptEconomics({
                  attemptCost,
                  fundedValue: fundedValue.value,
                  passProbability,
              });
    return {
        disclosures: funnel.disclosures,
        fundedValueToAttemptCostLabel:
            economics?.value?.fundedValueToAttemptCost.value?.label ?? null,
        result: funnel.value,
    };
}

export default function FunnelWhatIfSection() {
    const whatIfForm = useForm<FunnelWhatIfFormValues>({
        defaultValues: EMPTY_WHAT_IF_FORM,
        mode: 'onChange',
        resolver: zodResolver(funnelWhatIfFormSchema, undefined, {
            raw: true,
        }),
    });
    const { isValid } = whatIfForm.formState;
    const values = whatIfForm.watch();
    const isFilled = [
        values.attemptCost,
        values.attempts,
        values.averagePayout,
        values.passRate,
        values.payoutRate,
    ].every((value) => value.trim() !== '');
    const outcome = isFilled && isValid ? funnelWhatIfFromForm(values) : null;
    const isInvalid = isFilled && outcome === null;

    return (
        <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
            <p className="text-xs font-medium text-muted-foreground">
                What-if funnel (attempts, pass rate, payout rate, payout, fee)
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <WhatIfField
                    id="cash-flow-what-if-attempts"
                    invalid={isInvalid}
                    label="Attempts"
                    registration={whatIfForm.register('attempts')}
                />
                <WhatIfField
                    id="cash-flow-what-if-pass-rate"
                    invalid={isInvalid}
                    label="Pass rate (%)"
                    registration={whatIfForm.register('passRate')}
                />
                <WhatIfField
                    id="cash-flow-what-if-payout-rate"
                    invalid={isInvalid}
                    label="Payout rate given funded (%)"
                    registration={whatIfForm.register('payoutRate')}
                />
                <WhatIfField
                    id="cash-flow-what-if-average-payout"
                    invalid={isInvalid}
                    label="Average payout ($)"
                    registration={whatIfForm.register('averagePayout')}
                />
                <WhatIfField
                    id="cash-flow-what-if-attempt-cost"
                    invalid={isInvalid}
                    label="Attempt cost ($)"
                    registration={whatIfForm.register('attemptCost')}
                />
            </div>
            {isInvalid ? (
                <p
                    className="text-[11px] text-rose-400"
                    id={WHAT_IF_VALIDATION_MESSAGE_ID}
                >
                    {WHAT_IF_VALIDATION_MESSAGE}
                </p>
            ) : outcome === null ? null : (
                <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                        <StatCard
                            label="Passed"
                            value={outcome.result.passed.toFixed(1)}
                        />
                        <StatCard
                            label="Paid"
                            value={outcome.result.paid.toFixed(1)}
                        />
                        <StatCard
                            label="Fees"
                            value={formatCompactCurrency(outcome.result.fees)}
                        />
                        <StatCard
                            label="Payouts"
                            value={formatCompactCurrency(
                                outcome.result.payouts,
                            )}
                        />
                        <StatCard
                            label="Net"
                            value={formatCompactCurrency(outcome.result.net)}
                            valueClassName={
                                outcome.result.net >= 0
                                    ? 'text-emerald-400'
                                    : 'text-rose-400'
                            }
                        />
                        <StatCard
                            label="Payout multiple"
                            value={
                                outcome.result.payoutMultiple.value === null
                                    ? NOT_APPLICABLE
                                    : `${outcome.result.payoutMultiple.value.toFixed(2)}:1`
                            }
                        />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        {outcome.disclosures
                            .map(
                                (disclosure) =>
                                    ECONOMICS_DISCLOSURE_TEXT[disclosure],
                            )
                            .join('; ')}
                        {outcome.fundedValueToAttemptCostLabel === null
                            ? ''
                            : ` · ${outcome.fundedValueToAttemptCostLabel}`}
                    </p>
                </>
            )}
        </div>
    );
}

function WhatIfField({
    id,
    invalid = false,
    label,
    registration,
}: {
    id: string;
    invalid?: boolean;
    label: string;
    registration: UseFormRegisterReturn;
}) {
    return (
        <div className="flex flex-col gap-1">
            <label className="text-[11px] text-muted-foreground" htmlFor={id}>
                {label}
            </label>
            <Input
                {...registration}
                aria-describedby={
                    invalid ? WHAT_IF_VALIDATION_MESSAGE_ID : undefined
                }
                aria-invalid={invalid}
                className="h-7 text-xs"
                id={id}
                inputMode="decimal"
                type="number"
            />
        </div>
    );
}
