'use client';

import { Input } from '~/components/ui/Input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import { type DayStopRule, DayStopRuleKind } from '~/lib/prop-calculator';
import { cn } from '~/lib/utilities';

interface DayStopRulePickerProperties {
    compact?: boolean;
    onChange: (rule: DayStopRule) => void;
    value: DayStopRule;
}

type Kind = DayStopRule['kind'];

const KIND_LABEL: Record<Kind, string> = {
    'after-k-losses': 'Stop after K losses',
    'after-target': 'Stop after $ target',
    'day-green': 'Stop when day is green',
    'first-win': 'Stop after first win',
    none: 'No stop',
};

export default function DayStopRulePicker({
    compact = false,
    onChange,
    value,
}: DayStopRulePickerProperties) {
    const handleKind = (kind: Kind) => {
        switch (kind) {
            case DayStopRuleKind.AfterKLosses: {
                onChange({
                    k:
                        value.kind === DayStopRuleKind.AfterKLosses
                            ? Math.max(1, value.k)
                            : 2,
                    kind: DayStopRuleKind.AfterKLosses,
                });
                return;
            }
            case DayStopRuleKind.AfterTarget: {
                onChange({
                    dollars:
                        value.kind === DayStopRuleKind.AfterTarget
                            ? Math.max(1, value.dollars)
                            : 500,
                    kind: DayStopRuleKind.AfterTarget,
                });
                return;
            }
            case DayStopRuleKind.DayGreen: {
                onChange({ kind: DayStopRuleKind.DayGreen });
                return;
            }
            case DayStopRuleKind.FirstWin: {
                onChange({ kind: DayStopRuleKind.FirstWin });
                return;
            }
            case DayStopRuleKind.None: {
                onChange({ kind: DayStopRuleKind.None });
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
                onValueChange={(v) => handleKind(v as Kind)}
                value={value.kind}
            >
                <SelectTrigger
                    aria-label="Day stop rule"
                    className={compact ? 'h-7 text-xs' : undefined}
                >
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                        <SelectItem key={k} value={k}>
                            {KIND_LABEL[k]}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {value.kind === DayStopRuleKind.AfterKLosses && (
                <Input
                    aria-label="K losses"
                    className={compact ? 'h-7 text-xs' : undefined}
                    max={20}
                    min={1}
                    onChange={(event) => {
                        const parsed = Math.floor(Number(event.target.value));
                        const n = Math.max(1, Math.min(20, parsed));
                        if (Number.isFinite(n))
                            onChange({
                                k: n,
                                kind: DayStopRuleKind.AfterKLosses,
                            });
                    }}
                    step={1}
                    type="number"
                    value={value.k}
                />
            )}
            {value.kind === DayStopRuleKind.AfterTarget && (
                <Input
                    aria-label="Target dollars"
                    className={compact ? 'h-7 text-xs' : undefined}
                    min={1}
                    onChange={(event) => {
                        const n = Math.max(1, Number(event.target.value));
                        if (Number.isFinite(n))
                            onChange({
                                dollars: n,
                                kind: DayStopRuleKind.AfterTarget,
                            });
                    }}
                    step={50}
                    type="number"
                    value={value.dollars}
                />
            )}
        </div>
    );
}
