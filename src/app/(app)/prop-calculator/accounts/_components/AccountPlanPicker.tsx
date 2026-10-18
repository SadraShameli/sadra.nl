'use client';

import { CheckboxCard } from '~/components/ToggleCard';
import { Badge } from '~/components/ui/badge';
import {
    Field,
    FieldError,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from '~/components/ui/field';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import {
    findFirm,
    type FirmId,
    NO_PLAN_OPT_INS,
    parseFirmId,
    type Plan,
    serializePlanId,
} from '~/lib/prop-calculator';

import {
    accountFirmOptions,
    accountOptInOptions,
    AccountPlanIntent,
    AccountPlanMode,
    accountPlanOptions,
    type AccountPlanSelection,
    accountSizeOptions,
    keepOfferedOptIns,
    planTagLabel,
} from './accountPlanOptions';

const PLAN_ERRORS_ID = 'account-plan-errors';

interface AccountPlanPickerProperties {
    readonly disabled?: boolean;
    readonly errors: readonly string[];
    readonly intent?: AccountPlanIntent;
    readonly mode?: AccountPlanMode;
    readonly onChange: (next: AccountPlanSelection) => void;
    readonly value: AccountPlanSelection;
}

export function AccountPlanPicker({
    disabled = false,
    errors,
    intent = AccountPlanIntent.ExistingAccount,
    mode = AccountPlanMode.Modeled,
    onChange,
    value,
}: AccountPlanPickerProperties) {
    const firm = findFirm(value.firmId);
    const plan = firm?.findPlanBySerial(value.planSerial) ?? null;
    const planOptions =
        firm === undefined ? [] : accountPlanOptions(firm, intent);
    const sizeOptions =
        firm === undefined || plan === null
            ? []
            : accountSizeOptions(firm, plan, mode);
    const isLedgerOnly = mode === AccountPlanMode.LedgerOnly;
    const optInOptions =
        plan === null || isLedgerOnly ? [] : accountOptInOptions(plan);
    const hasErrors = errors.length > 0;
    const errorProperties = hasErrors
        ? { 'aria-describedby': PLAN_ERRORS_ID, 'aria-invalid': true }
        : {};

    const selectPlan = (next: Plan, firmId: FirmId) => {
        onChange({
            accountSize: next.id.accountSize,
            firmId,
            optIns: keepOfferedOptIns(next, value.optIns),
            planSerial: serializePlanId(next.id),
        });
    };

    return (
        <FieldSet
            className="app-prop-accounts__plan-picker grid gap-4 md:grid-cols-3"
            disabled={disabled}
        >
            <FieldLegend className="sr-only">Firm and plan</FieldLegend>
            {!isLedgerOnly && (
                <Field>
                    <FieldLabel htmlFor="account-firm">Firm</FieldLabel>
                    <Select
                        onValueChange={(next) => {
                            const firmId = parseFirmId(next);
                            const nextFirm =
                                firmId === undefined
                                    ? undefined
                                    : findFirm(firmId);
                            const [firstOption] =
                                nextFirm === undefined
                                    ? []
                                    : accountPlanOptions(nextFirm, intent);
                            const first =
                                firstOption === undefined
                                    ? undefined
                                    : (nextFirm?.findPlanBySerial(
                                          firstOption.planSerial,
                                      ) ?? undefined);
                            if (firmId === undefined || first === undefined)
                                return;
                            onChange({
                                accountSize: first.id.accountSize,
                                firmId,
                                optIns: NO_PLAN_OPT_INS,
                                planSerial: serializePlanId(first.id),
                            });
                        }}
                        value={value.firmId}
                    >
                        <SelectTrigger id="account-firm" {...errorProperties}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {accountFirmOptions().map((option) => (
                                <SelectItem
                                    key={option.firmId}
                                    value={option.firmId}
                                >
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
            )}
            <Field className="md:col-span-2">
                <FieldLabel htmlFor="account-plan">Plan and variant</FieldLabel>
                <Select
                    onValueChange={(next) => {
                        const nextPlan = firm?.findPlanBySerial(next) ?? null;
                        if (nextPlan !== null)
                            selectPlan(nextPlan, value.firmId);
                    }}
                    value={value.planSerial}
                >
                    <SelectTrigger id="account-plan" {...errorProperties}>
                        <SelectValue placeholder="Pick a plan" />
                    </SelectTrigger>
                    <SelectContent>
                        {planOptions.map((option) => (
                            <SelectItem
                                key={option.planSerial}
                                value={option.planSerial}
                            >
                                <span className="flex items-center gap-2">
                                    {option.label}
                                    {option.tags.map((tag) => (
                                        <Badge key={tag}>
                                            {planTagLabel(tag)}
                                        </Badge>
                                    ))}
                                </span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>
            <Field>
                <FieldLabel htmlFor="account-size">Account size</FieldLabel>
                <Select
                    onValueChange={(next) => {
                        const option = sizeOptions.find(
                            (candidate) =>
                                String(candidate.accountSize) === next,
                        );
                        const sibling =
                            option?.planSerial === null ||
                            option?.planSerial === undefined
                                ? null
                                : (firm?.findPlanBySerial(option.planSerial) ??
                                  null);
                        if (sibling !== null) {
                            selectPlan(sibling, value.firmId);
                        } else if (
                            isLedgerOnly &&
                            option?.isSelectable === true
                        ) {
                            onChange({
                                ...value,
                                accountSize: option.accountSize,
                            });
                        }
                    }}
                    value={String(value.accountSize)}
                >
                    <SelectTrigger id="account-size" {...errorProperties}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {sizeOptions.map((option) => (
                            <SelectItem
                                disabled={!option.isSelectable}
                                key={option.accountSize}
                                value={String(option.accountSize)}
                            >
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>
            {!isLedgerOnly && (
                <FieldSet className="gap-2 md:col-span-2">
                    <FieldLegend className="mb-1" variant="label">
                        Plan options
                    </FieldLegend>
                    {optInOptions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            This plan offers no opt-in options.
                        </p>
                    ) : (
                        <div className="grid gap-2 md:grid-cols-2">
                            {optInOptions.map((option) => {
                                const id = `account-opt-in-${option.optIn}`;
                                return (
                                    <CheckboxCard
                                        {...errorProperties}
                                        checked={value.optIns[option.field]}
                                        id={id}
                                        key={option.optIn}
                                        label={`Takes the ${option.label}`}
                                        onCheckedChange={(isChecked) => {
                                            onChange({
                                                ...value,
                                                optIns: {
                                                    ...value.optIns,
                                                    [option.field]: isChecked,
                                                },
                                            });
                                        }}
                                    />
                                );
                            })}
                        </div>
                    )}
                </FieldSet>
            )}
            {hasErrors && (
                <FieldError className="md:col-span-3" id={PLAN_ERRORS_ID}>
                    <ul>
                        {errors.map((error) => (
                            <li key={error}>{error}</li>
                        ))}
                    </ul>
                </FieldError>
            )}
        </FieldSet>
    );
}
