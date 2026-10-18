'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { FormDialog } from '~/components/FormDialog';
import {
    FormControlField,
    FormNumberField,
    FormSelectField,
    type FormSelectOption,
} from '~/components/FormFields';
import { Button } from '~/components/ui/button';
import { FieldDescription, FieldLegend, FieldSet } from '~/components/ui/field';
import { Toggle } from '~/components/ui/toggle';
import {
    ALL_INSTRUMENTS,
    FirmId,
    type InstrumentSymbol,
    type Plan,
    type PlanId,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';
import {
    CALCULATOR_SCALAR_BOUNDS,
    portfolioEntrySchema,
} from '~/lib/schemas/url';

import {
    describeActivationFee,
    describeEvalFee,
    describeMonthlySubscriptionFee,
    purchaseCouponDiscounts,
} from './feePreview';
import { PercentInput } from './PercentInput';
import { describeResetFee, hasResetOption } from './retryDescription';
import { type PortfolioEntry } from './types';

const GLOBAL_SIZING_KEY = 'global';
const STOP_POINTS_BOUNDS = CALCULATOR_SCALAR_BOUNDS.sp;
const wireEntry = portfolioEntrySchema.shape;

const INSTRUMENT_OPTIONS: readonly FormSelectOption<InstrumentSymbol | null>[] =
    [
        { label: 'Use global setting', value: null },
        ...ALL_INSTRUMENTS.map((spec) => ({
            label: spec.symbol,
            value: spec.symbol,
        })),
    ];

export function hasCouponDiscount(
    entry: Pick<
        PortfolioEntry,
        | 'activationDiscountPercent'
        | 'evalDiscountPercent'
        | 'linkActivationDiscount'
        | 'monthlySubscriptionDiscountPercent'
        | 'resetDiscountPercent'
    >,
): boolean {
    const activationDiscount = entry.linkActivationDiscount
        ? entry.evalDiscountPercent
        : entry.activationDiscountPercent;
    return (
        entry.evalDiscountPercent > 0 ||
        activationDiscount > 0 ||
        entry.monthlySubscriptionDiscountPercent > 0 ||
        entry.resetDiscountPercent > 0
    );
}

export function PortfolioEntryDialog({
    firms,
    globalStopPoints,
    initial,
    onCancel,
    onSubmit,
    submitLabel,
    title,
}: {
    firms: readonly TradingFirm[];
    globalStopPoints: null | number;
    initial: PortfolioEntry;
    onCancel: () => void;
    onSubmit: (entry: PortfolioEntry) => void;
    submitLabel: string;
    title: string;
}) {
    const schema = useMemo(() => portfolioEntryFormSchema(firms), [firms]);
    const form = useForm({
        defaultValues: initial,
        resolver: zodResolver(schema),
    });
    const [
        firmId,
        planId,
        count,
        evalDiscountPercent,
        activationDiscountPercent,
        isActivationLinked,
        monthlySubscriptionDiscountPercent,
        resetDiscountPercent,
        instrument,
    ] = useWatch({
        control: form.control,
        name: [
            'firmId',
            'planId',
            'count',
            'evalDiscountPercent',
            'activationDiscountPercent',
            'linkActivationDiscount',
            'monthlySubscriptionDiscountPercent',
            'resetDiscountPercent',
            'instrument',
        ],
    });
    const firm = firms.find((candidate) => candidate.id === firmId);
    const plan = firm?.findPlan(planId) ?? firm?.plans[0];
    const firmOptions = useMemo<readonly FormSelectOption<FirmId>[]>(
        () =>
            firms.map((candidate) => ({
                label: candidate.displayName,
                value: candidate.id,
            })),
        [firms],
    );
    const planOptions = useMemo<readonly FormSelectOption<PlanId>[]>(
        () =>
            (firm?.plans ?? []).map((candidate) => ({
                label: candidate.label,
                value: candidate.id,
            })),
        [firm],
    );
    if (firm === undefined || plan === undefined) return null;
    const maxAccounts = firm.maxFundedAccounts(plan);
    const coupon = {
        activationDiscountPercent,
        evalDiscountPercent,
        linkActivationDiscount: isActivationLinked,
        monthlySubscriptionDiscountPercent,
        resetDiscountPercent,
    };
    const purchaseDiscounts = purchaseCouponDiscounts(
        plan,
        coupon,
        Number.isFinite(count) ? count : 1,
    );

    function clampCount(next: Plan, owner: TradingFirm) {
        const current = form.getValues('count');
        if (Number.isFinite(current)) {
            form.setValue(
                'count',
                Math.min(current, owner.maxFundedAccounts(next)),
            );
        }
    }

    return (
        <FormDialog
            form={form}
            onCancel={onCancel}
            onSubmit={onSubmit}
            pending={false}
            submitLabel={submitLabel}
            title={title}
        >
            <div className="grid gap-4 sm:grid-cols-2">
                <FormSelectField
                    control={form.control}
                    keyOf={(value) => value}
                    label="Firm"
                    name="firmId"
                    onValueChange={(value) => {
                        const next = firms.find(
                            (candidate) => candidate.id === value,
                        );
                        const first = next?.plans[0];
                        if (next === undefined || first === undefined) return;
                        form.setValue('planId', first.id);
                        clampCount(first, next);
                    }}
                    options={firmOptions}
                />
                <FormSelectField
                    control={form.control}
                    keyOf={serializePlanId}
                    label="Plan"
                    name="planId"
                    onValueChange={(value) => {
                        const next = firm.findPlan(value);
                        if (next !== undefined) clampCount(next, firm);
                    }}
                    options={planOptions}
                />
            </div>
            <FormNumberField
                control={form.control}
                isInteger
                label={`Accounts (${firm.displayName} caps at ${maxAccounts})`}
                max={maxAccounts}
                min={1}
                name="count"
            />
            <FieldSet className="gap-4">
                <FieldLegend variant="label">Coupon discounts</FieldLegend>
                <FormControlField
                    control={form.control}
                    isDisabled={plan.fees.oneTimeEval === 0}
                    label="Eval fee discount"
                    name="evalDiscountPercent"
                >
                    {({ field, id }) => (
                        <>
                            <PercentInput
                                id={id}
                                isDisabled={plan.fees.oneTimeEval === 0}
                                onChange={field.onChange}
                                value={field.value}
                            />
                            <FieldDescription>
                                {describeEvalFee(plan.fees, purchaseDiscounts)}
                            </FieldDescription>
                        </>
                    )}
                </FormControlField>
                <FormControlField
                    control={form.control}
                    isDisabled={
                        plan.fees.activation === 0 || isActivationLinked
                    }
                    label="Activation fee discount"
                    name="activationDiscountPercent"
                >
                    {({ field, id }) => (
                        <>
                            <div className="flex items-stretch gap-2">
                                <PercentInput
                                    id={id}
                                    isDisabled={
                                        plan.fees.activation === 0 ||
                                        isActivationLinked
                                    }
                                    onChange={field.onChange}
                                    value={
                                        isActivationLinked
                                            ? evalDiscountPercent
                                            : field.value
                                    }
                                />
                                <Toggle
                                    className="whitespace-nowrap"
                                    disabled={plan.fees.activation === 0}
                                    onPressedChange={(isLinked: boolean) =>
                                        form.setValue(
                                            'linkActivationDiscount',
                                            isLinked,
                                        )
                                    }
                                    pressed={isActivationLinked}
                                    size="sm"
                                    variant="outline"
                                >
                                    Match eval
                                </Toggle>
                            </div>
                            <FieldDescription>
                                {describeActivationFee(
                                    plan.fees,
                                    purchaseDiscounts,
                                )}
                            </FieldDescription>
                        </>
                    )}
                </FormControlField>
                <FormControlField
                    control={form.control}
                    isDisabled={plan.fees.monthlySubscription === 0}
                    label="Monthly subscription discount"
                    name="monthlySubscriptionDiscountPercent"
                >
                    {({ field, id }) => (
                        <>
                            <PercentInput
                                id={id}
                                isDisabled={plan.fees.monthlySubscription === 0}
                                onChange={field.onChange}
                                value={field.value}
                            />
                            <FieldDescription>
                                {describeMonthlySubscriptionFee(
                                    plan.fees,
                                    purchaseDiscounts,
                                )}
                            </FieldDescription>
                        </>
                    )}
                </FormControlField>
                <FormControlField
                    control={form.control}
                    isDisabled={!hasResetOption(plan.fees)}
                    label="Reset fee discount"
                    name="resetDiscountPercent"
                >
                    {({ field, id }) => (
                        <>
                            <PercentInput
                                id={id}
                                isDisabled={!hasResetOption(plan.fees)}
                                onChange={field.onChange}
                                value={field.value}
                            />
                            <FieldDescription>
                                {describeResetFee(plan.fees, purchaseDiscounts)}
                            </FieldDescription>
                        </>
                    )}
                </FormControlField>
                {hasCouponDiscount(coupon) && (
                    <Button
                        className="w-fit px-0"
                        onClick={() => {
                            form.setValue('activationDiscountPercent', 0);
                            form.setValue('evalDiscountPercent', 0);
                            form.setValue('linkActivationDiscount', false);
                            form.setValue(
                                'monthlySubscriptionDiscountPercent',
                                0,
                            );
                            form.setValue('resetDiscountPercent', 0);
                        }}
                        size="sm"
                        type="button"
                        variant="link"
                    >
                        Reset discounts
                    </Button>
                )}
            </FieldSet>
            <FieldSet className="gap-4">
                <FieldLegend variant="label">Contract-limit sizing</FieldLegend>
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormSelectField
                        control={form.control}
                        keyOf={(value) => value ?? GLOBAL_SIZING_KEY}
                        label="Instrument"
                        name="instrument"
                        onValueChange={(value) => {
                            if (value === null) {
                                form.setValue('stopPoints', null);
                                return;
                            }
                            if (form.getValues('stopPoints') === null) {
                                form.setValue(
                                    'stopPoints',
                                    globalStopPoints ?? NaN,
                                );
                            }
                        }}
                        options={INSTRUMENT_OPTIONS}
                    />
                    <FormNumberField
                        control={form.control}
                        isDisabled={instrument === null}
                        label="Stop distance (points)"
                        max={STOP_POINTS_BOUNDS.max}
                        min={STOP_POINTS_BOUNDS.min}
                        name="stopPoints"
                    />
                </div>
            </FieldSet>
        </FormDialog>
    );
}

function portfolioEntryFormSchema(firms: readonly TradingFirm[]) {
    return z
        .object({
            activationDiscountPercent: wireEntry.activationDiscountPercent,
            count: wireEntry.count,
            evalDiscountPercent: wireEntry.evalDiscountPercent,
            firmId: z.enum(FirmId),
            id: wireEntry.id,
            instrument: wireEntry.instrument.unwrap(),
            linkActivationDiscount: wireEntry.linkActivationDiscount,
            monthlySubscriptionDiscountPercent:
                wireEntry.monthlySubscriptionDiscountPercent.unwrap(),
            planId: z.custom<PlanId>(),
            resetDiscountPercent: wireEntry.resetDiscountPercent.unwrap(),
            stopPoints: wireEntry.stopPoints.unwrap(),
        })
        .superRefine((entry, context) => {
            const firm = firms.find(
                (candidate) => candidate.id === entry.firmId,
            );
            const plan = firm?.findPlan(entry.planId);
            if (firm === undefined || plan === undefined) {
                context.addIssue({
                    code: 'custom',
                    message: 'Pick a plan this firm offers.',
                    path: ['planId'],
                });
                return;
            }
            const maxAccounts = firm.maxFundedAccounts(plan);
            if (entry.count > maxAccounts) {
                context.addIssue({
                    code: 'custom',
                    message: `${firm.displayName} caps at ${maxAccounts}.`,
                    path: ['count'],
                });
            }
        });
}
