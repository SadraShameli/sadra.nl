'use client';

import { Field, FieldDescription, FieldLabel } from '~/components/ui/field';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import { formatCompactCurrency } from '~/lib/format';
import {
    parseFirmId,
    type Plan,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';
import { cn } from '~/lib/utilities';

interface FirmPlanPickerProperties {
    firm: TradingFirm;
    firms: readonly TradingFirm[];
    onFirmChange: (firm: TradingFirm) => void;
    onPlanChange: (plan: Plan) => void;
    plan: Plan;
}

export default function FirmPlanPicker({
    firm,
    firms,
    onFirmChange,
    onPlanChange,
    plan,
}: FirmPlanPickerProperties) {
    return (
        <div
            className={cn(
                'app-prop-calculator__firm-plan-picker',
                'grid gap-4 md:grid-cols-2',
            )}
        >
            <Field>
                <FieldLabel htmlFor="firm-select">Firm</FieldLabel>
                <Select
                    onValueChange={(v) => {
                        const firmId = parseFirmId(v);
                        const next = firms.find((f) => f.id === firmId);
                        if (next) onFirmChange(next);
                    }}
                    value={firm.id}
                >
                    <SelectTrigger id="firm-select">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {firms.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                                {f.displayName}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>

            <Field>
                <FieldLabel htmlFor="plan-select">
                    Plan &amp; account size
                </FieldLabel>
                <Select
                    onValueChange={(v) => {
                        const next = firm.findPlanBySerial(v);
                        if (next) onPlanChange(next);
                    }}
                    value={serializePlanId(plan.id)}
                >
                    <SelectTrigger
                        aria-describedby="plan-select-terms"
                        id="plan-select"
                    >
                        <SelectValue>{plan.label}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {firm.plans.map((p) => (
                            <SelectItem
                                key={serializePlanId(p.id)}
                                value={serializePlanId(p.id)}
                            >
                                <span className="flex flex-col">
                                    <span>{p.label}</span>
                                    <span className="text-xs text-muted-foreground">
                                        {planTermsText(p)}
                                    </span>
                                </span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <FieldDescription id="plan-select-terms">
                    {planTermsText(plan)}
                </FieldDescription>
            </Field>
        </div>
    );
}

function planTermsText(plan: Plan): string {
    return `Target ${formatCompactCurrency(plan.profitTarget)} · drawdown ${formatCompactCurrency(plan.drawdown.amount)}`;
}
