'use client';

import { Badge } from '~/components/ui/Badge';
import { Checkbox } from '~/components/ui/Checkbox';
import { Label } from '~/components/ui/Label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
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
    accountPlanOptions,
    type AccountPlanSelection,
    accountSizeOptions,
    planTagLabel,
} from './accountPlanOptions';

const PLAN_ERRORS_ID = 'account-plan-errors';

interface AccountPlanPickerProperties {
    readonly disabled?: boolean;
    readonly errors: readonly string[];
    readonly onChange: (next: AccountPlanSelection) => void;
    readonly value: AccountPlanSelection;
}

export function AccountPlanPicker({
    disabled = false,
    errors,
    onChange,
    value,
}: AccountPlanPickerProperties) {
    const firm = findFirm(value.firmId);
    const plan = firm?.findPlanBySerial(value.planSerial) ?? null;
    const planOptions = firm === undefined ? [] : accountPlanOptions(firm);
    const sizeOptions =
        firm === undefined || plan === null
            ? []
            : accountSizeOptions(firm, plan);
    const optInOptions = plan === null ? [] : accountOptInOptions(plan);
    const hasErrors = errors.length > 0;
    const errorProperties = hasErrors
        ? { 'aria-describedby': PLAN_ERRORS_ID, 'aria-invalid': true }
        : {};

    const selectPlan = (next: Plan, firmId: FirmId) => {
        const offered = new Set(
            accountOptInOptions(next).map((option) => option.field),
        );
        onChange({
            accountSize: next.id.accountSize,
            firmId,
            optIns: {
                takesFundedReset:
                    offered.has('takesFundedReset') &&
                    value.optIns.takesFundedReset,
                takesOneTimeEarlyWithdrawal:
                    offered.has('takesOneTimeEarlyWithdrawal') &&
                    value.optIns.takesOneTimeEarlyWithdrawal,
            },
            planSerial: serializePlanId(next.id),
        });
    };

    return (
        <fieldset
            className="app-prop-accounts__plan-picker grid gap-4 md:grid-cols-3"
            disabled={disabled}
        >
            <legend className="sr-only">Firm and plan</legend>
            <div className="flex flex-col gap-2">
                <Label htmlFor="account-firm">Firm</Label>
                <Select
                    onValueChange={(next) => {
                        const firmId = parseFirmId(next);
                        const nextFirm =
                            firmId === undefined ? undefined : findFirm(firmId);
                        const [first] = nextFirm?.plans ?? [];
                        if (firmId === undefined || first === undefined) return;
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
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
                <Label htmlFor="account-plan">Plan and variant</Label>
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
                                        <Badge key={tag} variant="outline">
                                            {planTagLabel(tag)}
                                        </Badge>
                                    ))}
                                </span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="flex flex-col gap-2">
                <Label htmlFor="account-size">Account size</Label>
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
                        if (sibling !== null) selectPlan(sibling, value.firmId);
                    }}
                    value={String(value.accountSize)}
                >
                    <SelectTrigger id="account-size" {...errorProperties}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {sizeOptions.map((option) => (
                            <SelectItem
                                disabled={!option.isModeled}
                                key={option.accountSize}
                                value={String(option.accountSize)}
                            >
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
                <span className="text-sm font-medium">Plan options</span>
                {optInOptions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        This plan offers no opt-in options.
                    </p>
                ) : (
                    optInOptions.map((option) => {
                        const id = `account-opt-in-${option.optIn}`;
                        return (
                            <div
                                className="flex items-center gap-2"
                                key={option.optIn}
                            >
                                <Checkbox
                                    {...errorProperties}
                                    checked={value.optIns[option.field]}
                                    id={id}
                                    onCheckedChange={(checked) => {
                                        onChange({
                                            ...value,
                                            optIns: {
                                                ...value.optIns,
                                                [option.field]:
                                                    checked === true,
                                            },
                                        });
                                    }}
                                />
                                <Label htmlFor={id}>
                                    Takes the {option.label}
                                </Label>
                            </div>
                        );
                    })
                )}
            </div>
            {hasErrors && (
                <ul
                    className="text-sm text-destructive md:col-span-3"
                    id={PLAN_ERRORS_ID}
                >
                    {errors.map((error) => (
                        <li key={error}>{error}</li>
                    ))}
                </ul>
            )}
        </fieldset>
    );
}
