'use client';

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import { formatCompactCurrency } from '~/lib/format';
import {
    type FirmId,
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
            <div>
                <label
                    className="mb-2 block text-xs font-medium text-muted-foreground"
                    htmlFor="firm-select"
                >
                    Firm
                </label>
                <Select
                    onValueChange={(v) => {
                        const next = firms.find((f) => f.id === (v as FirmId));
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
            </div>

            <div>
                <label
                    className="mb-2 block text-xs font-medium text-muted-foreground"
                    htmlFor="plan-select"
                >
                    Plan &amp; account size
                </label>
                <Select
                    onValueChange={(v) => {
                        const next = firm.plans.find(
                            (p) => serializePlanId(p.id) === v,
                        );
                        if (next) onPlanChange(next);
                    }}
                    value={serializePlanId(plan.id)}
                >
                    <SelectTrigger id="plan-select">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {firm.plans.map((p) => (
                            <SelectItem
                                key={serializePlanId(p.id)}
                                value={serializePlanId(p.id)}
                            >
                                {p.label} · target{' '}
                                {formatCompactCurrency(p.profitTarget)} ·
                                drawdown{' '}
                                {formatCompactCurrency(p.drawdown.amount)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}
