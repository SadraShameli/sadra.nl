'use client';

import { z } from 'zod';

import { Input } from '~/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
import { type DayStopRule, DayStopRuleKind } from '~/lib/prop-calculator';
import { cn } from '~/lib/utilities';

import { DAY_STOP_KIND_LABELS } from './describeDayStopRule';

interface DayStopRulePickerProperties {
    id?: string;
    onChange: (rule: DayStopRule) => void;
    value: DayStopRule;
}

const DAY_STOP_RULE_LABEL = 'Day stop rule';

type Kind = DayStopRule['kind'];

export default function DayStopRulePicker({
    id,
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
                'flex flex-col gap-2',
            )}
        >
            <Select
                onValueChange={(v) =>
                    handleKind(z.enum(DayStopRuleKind).parse(v))
                }
                value={value.kind}
            >
                <SelectTrigger
                    aria-label={
                        id === undefined ? DAY_STOP_RULE_LABEL : undefined
                    }
                    id={id}
                >
                    <SelectValue>
                        {DAY_STOP_KIND_LABELS[value.kind]}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent>
                    {Object.values(DayStopRuleKind).map((k) => (
                        <SelectItem key={k} value={k}>
                            {DAY_STOP_KIND_LABELS[k]}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {value.kind === DayStopRuleKind.AfterKLosses && (
                <Input
                    aria-label="K losses"
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
