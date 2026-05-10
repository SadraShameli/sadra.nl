'use client';

import { type DayStopRule } from '~/lib/prop-calculator';

import { Input } from '~/components/ui/Input';
import { Select } from '~/components/ui/Select';

interface DayStopRulePickerProps {
    value: DayStopRule;
    onChange: (rule: DayStopRule) => void;
    compact?: boolean;
}

type Kind = DayStopRule['kind'];

const KIND_LABEL: Record<Kind, string> = {
    none: 'No stop',
    'first-win': 'Stop after first win',
    'after-k-losses': 'Stop after K losses',
    'after-target': 'Stop after $ target',
};

export default function DayStopRulePicker({
    value,
    onChange,
    compact = false,
}: DayStopRulePickerProps) {
    const handleKind = (kind: Kind) => {
        switch (kind) {
            case 'none':
                onChange({ kind: 'none' });
                return;
            case 'first-win':
                onChange({ kind: 'first-win' });
                return;
            case 'after-k-losses':
                onChange({
                    kind: 'after-k-losses',
                    k:
                        value.kind === 'after-k-losses'
                            ? Math.max(1, value.k)
                            : 2,
                });
                return;
            case 'after-target':
                onChange({
                    kind: 'after-target',
                    dollars:
                        value.kind === 'after-target'
                            ? Math.max(1, value.dollars)
                            : 500,
                });
                return;
        }
    };

    return (
        <div
            className={compact ? 'flex flex-col gap-1' : 'flex flex-col gap-2'}
        >
            <Select
                aria-label="Day stop rule"
                value={value.kind}
                onChange={(e) => handleKind(e.target.value as Kind)}
                className={compact ? 'h-7 text-xs' : undefined}
            >
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                    <option key={k} value={k}>
                        {KIND_LABEL[k]}
                    </option>
                ))}
            </Select>
            {value.kind === 'after-k-losses' && (
                <Input
                    type="number"
                    min={1}
                    max={20}
                    step={1}
                    value={value.k}
                    onChange={(e) => {
                        const n = Math.max(
                            1,
                            Math.min(20, Math.floor(Number(e.target.value))),
                        );
                        if (Number.isFinite(n))
                            onChange({ kind: 'after-k-losses', k: n });
                    }}
                    className={compact ? 'h-7 text-xs' : undefined}
                    aria-label="K losses"
                />
            )}
            {value.kind === 'after-target' && (
                <Input
                    type="number"
                    min={1}
                    step={50}
                    value={value.dollars}
                    onChange={(e) => {
                        const n = Math.max(1, Number(e.target.value));
                        if (Number.isFinite(n))
                            onChange({ kind: 'after-target', dollars: n });
                    }}
                    className={compact ? 'h-7 text-xs' : undefined}
                    aria-label="Target dollars"
                />
            )}
        </div>
    );
}
