'use client';

import { Select } from '~/components/ui/Select';
import {
    type FirmId,
    type Plan,
    type PropFirm,
    serializePlanId,
} from '~/lib/prop-calculator';

import { formatCompactCurrency } from './helpers';

interface FirmPlanPickerProps {
    firms: readonly PropFirm[];
    firm: PropFirm;
    plan: Plan;
    onFirmChange: (firm: PropFirm) => void;
    onPlanChange: (plan: Plan) => void;
}

export default function FirmPlanPicker({
    firms,
    firm,
    plan,
    onFirmChange,
    onPlanChange,
}: FirmPlanPickerProps) {
    return (
        <div className="grid gap-4 md:grid-cols-2">
            <div>
                <label
                    htmlFor="firm-select"
                    className="mb-2 block text-xs font-medium text-muted-foreground"
                >
                    Firm
                </label>
                <Select
                    id="firm-select"
                    value={firm.id}
                    onChange={(e) => {
                        const next = firms.find(
                            (f) => f.id === (e.target.value as FirmId),
                        );
                        if (next) onFirmChange(next);
                    }}
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
                    htmlFor="plan-select"
                    className="mb-2 block text-xs font-medium text-muted-foreground"
                >
                    Plan &amp; account size
                </label>
                <Select
                    id="plan-select"
                    value={serializePlanId(plan.id)}
                    onChange={(e) => {
                        const next = firm.plans.find(
                            (p) => serializePlanId(p.id) === e.target.value,
                        );
                        if (next) onPlanChange(next);
                    }}
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
