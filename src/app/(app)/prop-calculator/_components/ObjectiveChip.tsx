'use client';

import { z } from 'zod';

import { formatCurrency } from '~/lib/format';
import { CENTS_PER_DOLLAR } from '~/lib/prop-calculator';
import {
    SIZING_OBJECTIVE_LABEL,
    SizingObjective,
    sizingObjectiveText,
} from '~/lib/prop-calculator/advisor';
import { cn } from '~/lib/utilities';

import {
    type ObjectiveChoice,
    ObjectiveQueryFailure,
    useCalculatorActions,
    useCalculatorInputs,
    useObjectiveChoice,
} from './CalculatorProvider';
import { CalculatorActionType } from './calculatorReducer';
import { OBJECTIVE_OPTIONS, riskTableObjective } from './objectiveRanking';

const objectiveSchema = z.enum(SizingObjective);

interface ObjectiveChipProperties {
    choiceNotes?: readonly string[];
    className?: string;
    note?: null | string;
    objective: SizingObjective;
    onChange: (objective: SizingObjective) => void;
}

export function CalculatorObjectiveChip({ className }: { className?: string }) {
    const { state } = useCalculatorInputs();
    const { dispatch } = useCalculatorActions();
    const choice = useObjectiveChoice();
    const view = riskTableObjective(state.objective);
    return (
        <ObjectiveChip
            choiceNotes={objectiveChoiceNotes(choice, state.objective)}
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
    choiceNotes = [],
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
            {choiceNotes.map((choiceNote) => (
                <p className="text-amber-400" key={choiceNote}>
                    {choiceNote}
                </p>
            ))}
        </div>
    );
}

export function objectiveChoiceNotes(
    choice: ObjectiveChoice,
    objective: SizingObjective,
    effective: SizingObjective = riskTableObjective(objective).effective,
): readonly string[] {
    const notes: string[] = [];
    if (choice.automaticBasis !== null) {
        const { availableCents, switchCents } = choice.automaticBasis;
        const threshold =
            switchCents === null
                ? 'objective threshold'
                : `${formatCurrency(switchCents / CENTS_PER_DOLLAR)} objective threshold`;
        notes.push(
            `Chosen automatically: your available bankroll ${formatCurrency(availableCents / CENTS_PER_DOLLAR)} is below your ${threshold}, ${automaticScope(objective, effective)}. Pick another objective here to override it.`,
        );
    }
    if (choice.queryFailure !== null) {
        notes.push(objectiveQueryFailureNote(choice.queryFailure));
    }
    return notes;
}

function automaticScope(
    objective: SizingObjective,
    effective: SizingObjective,
): string {
    return effective === objective
        ? `so this page ranks by ${SIZING_OBJECTIVE_LABEL[objective]}`
        : `so your bankroll selected ${SIZING_OBJECTIVE_LABEL[objective]}, which ranks which plan to buy; this page's sizing stays on ${SIZING_OBJECTIVE_LABEL[effective]}`;
}

function objectiveQueryFailureNote(failure: ObjectiveQueryFailure): string {
    switch (failure) {
        case ObjectiveQueryFailure.BankrollSummary: {
            return 'Your bankroll could not be loaded, so the objective was not chosen from your bankroll threshold.';
        }
        case ObjectiveQueryFailure.Rulebook: {
            return 'Your rulebook could not be loaded, so the objective was not chosen from your bankroll threshold.';
        }
    }
}
