'use client';

import { z } from 'zod';

import {
    SizingObjective,
    sizingObjectiveText,
} from '~/lib/prop-calculator/advisor';
import { cn } from '~/lib/utilities';

import {
    useCalculatorActions,
    useCalculatorInputs,
} from './CalculatorProvider';
import { CalculatorActionType } from './calculatorReducer';
import { OBJECTIVE_OPTIONS, riskTableObjective } from './objectiveRanking';

const objectiveSchema = z.enum(SizingObjective);

interface ObjectiveChipProperties {
    className?: string;
    note?: null | string;
    objective: SizingObjective;
    onChange: (objective: SizingObjective) => void;
}

export function CalculatorObjectiveChip({ className }: { className?: string }) {
    const { state } = useCalculatorInputs();
    const { dispatch } = useCalculatorActions();
    const view = riskTableObjective(state.objective);
    return (
        <ObjectiveChip
            className={className}
            note={view.note}
            objective={state.objective}
            onChange={(objective) =>
                dispatch({
                    objective,
                    type: CalculatorActionType.SetObjective,
                })
            }
        />
    );
}

export function ObjectiveChip({
    className,
    note = null,
    objective,
    onChange,
}: ObjectiveChipProperties) {
    const label = riskTableObjective(objective).label;
    return (
        <div
            className={cn(
                'app-prop-calculator__objective-chip flex flex-col gap-1 text-xs',
                className,
            )}
        >
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">
                    Objective: {label}
                </span>
                <select
                    aria-label="Ranking objective"
                    className="h-7 rounded-md border bg-transparent px-2 text-xs"
                    onChange={(event) => {
                        const chosen = objectiveSchema.safeParse(
                            event.target.value,
                        );
                        if (chosen.success) onChange(chosen.data);
                    }}
                    value={objective}
                >
                    {OBJECTIVE_OPTIONS.map((option) => (
                        <option key={option.objective} value={option.objective}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </div>
            <p className="text-muted-foreground">
                {sizingObjectiveText(objective)}
            </p>
            {note !== null && <p className="text-amber-400">{note}</p>}
        </div>
    );
}
