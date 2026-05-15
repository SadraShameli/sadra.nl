'use client';

import { Input } from '~/components/ui/Input';
import { Select } from '~/components/ui/Select';
import { type DayStopRule } from '~/lib/prop-calculator';
import { cn } from '~/lib/utils';

interface DayStopRulePickerProps {
    compact?: boolean;
    onChange: (rule: DayStopRule) => void;
    value: DayStopRule;
}

type Kind = DayStopRule['kind'];

const KIND_LABEL: Record<Kind, string> = {
    'after-k-losses': 'Stop after K losses',
    'after-target': 'Stop after $ target',
    'first-win': 'Stop after first win',
    none: 'No stop',
};

export default function DayStopRulePicker({
    compact = false,
    onChange,
    value,
}: DayStopRulePickerProps) {
    const handleKind = (kind: Kind) => {
        switch (kind) {
            case 'after-k-losses': {
                onChange({
                    k:
                        value.kind === 'after-k-losses'
                            ? Math.max(1, value.k)
                            : 2,
                    kind: 'after-k-losses',
                });
                return;
            }
            case 'after-target': {
                onChange({
                    dollars:
                        value.kind === 'after-target'
                            ? Math.max(1, value.dollars)
                            : 500,
                    kind: 'after-target',
                });
                return;
            }
            case 'first-win': {
                onChange({ kind: 'first-win' });
                return;
            }
            case 'none': {
                onChange({ kind: 'none' });
                return;
            }
        }
    };

    return (
        <div
            className={cn(
                'app-prop-calculator__day-stop-picker',
                compact ? 'flex flex-col gap-1' : 'flex flex-col gap-2',
            )}
        >
            <Select
                aria-label="Day stop rule"
                className={compact ? 'h-7 text-xs' : undefined}
                onChange={(e) => handleKind(e.target.value as Kind)}
                value={value.kind}
            >
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                    <option key={k} value={k}>
                        {KIND_LABEL[k]}
                    </option>
                ))}
            </Select>
            {value.kind === 'after-k-losses' && (
                <Input
                    aria-label="K losses"
                    className={compact ? 'h-7 text-xs' : undefined}
                    max={20}
                    min={1}
                    onChange={(e) => {
                        const n = Math.max(
                            1,
                            Math.min(20, Math.floor(Number(e.target.value))),
                        );
                        if (Number.isFinite(n))
                            onChange({ k: n, kind: 'after-k-losses' });
                    }}
                    step={1}
                    type="number"
                    value={value.k}
                />
            )}
            {value.kind === 'after-target' && (
                <Input
                    aria-label="Target dollars"
                    className={compact ? 'h-7 text-xs' : undefined}
                    min={1}
                    onChange={(e) => {
                        const n = Math.max(1, Number(e.target.value));
                        if (Number.isFinite(n))
                            onChange({ dollars: n, kind: 'after-target' });
                    }}
                    step={50}
                    type="number"
                    value={value.dollars}
                />
            )}
        </div>
    );
}
