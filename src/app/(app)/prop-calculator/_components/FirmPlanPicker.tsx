'use client';

import { Select } from '~/components/ui/Select';
import { formatCompactCurrency } from '~/lib/format';
import {
    type FirmId,
    type Plan,
    type PropFirm,
    serializePlanId,
} from '~/lib/prop-calculator';

interface FirmPlanPickerProps {
    firm: PropFirm;
    firms: readonly PropFirm[];
    onFirmChange: (firm: PropFirm) => void;
    onPlanChange: (plan: Plan) => void;
    plan: Plan;
}

export default function FirmPlanPicker({
    firm,
    firms,
    onFirmChange,
    onPlanChange,
    plan,
}: FirmPlanPickerProps) {
    return (
        <div className="grid gap-4 md:grid-cols-2">
            <div>
                <label
                    className="mb-2 block text-xs font-medium text-muted-foreground"
                    htmlFor="firm-select"
                >
                    Firm
                </label>
                <Select
                    id="firm-select"
                    onChange={(e) => {
                        const next = firms.find(
                            (f) => f.id === (e.target.value as FirmId),
                        );
                        if (next) onFirmChange(next);
                    }}
                    value={firm.id}
                >
                    {firms.map((f) => (
                        <option key={f.id} value={f.id}>
                            {f.displayName}
                        </option>
                    ))}
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
                    id="plan-select"
                    onChange={(e) => {
                        const next = firm.plans.find(
                            (p) => serializePlanId(p.id) === e.target.value,
                        );
                        if (next) onPlanChange(next);
                    }}
                    value={serializePlanId(plan.id)}
                >
                    {firm.plans.map((p) => (
                        <option
                            key={serializePlanId(p.id)}
                            value={serializePlanId(p.id)}
                        >
                            {p.label} · target{' '}
                            {formatCompactCurrency(p.profitTarget)} · drawdown{' '}
                            {formatCompactCurrency(p.drawdown.amount)}
                        </option>
                    ))}
                </Select>
            </div>
        </div>
    );
}
