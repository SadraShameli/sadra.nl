'use client';

import { useId } from 'react';
import { z } from 'zod';

import { Field, FieldDescription, FieldLabel } from '~/components/ui/Field';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
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

const OBJECTIVE_SELECT_LABEL = 'Ranking objective';

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
    const selectId = useId();
    return (
        <Field
            className={cn(
                'app-prop-calculator__objective-chip gap-1',
                className,
            )}
        >
            <div className="flex flex-wrap items-center gap-2">
                <FieldLabel htmlFor={selectId}>
                    {OBJECTIVE_SELECT_LABEL}
                </FieldLabel>
                <Select
                    onValueChange={(value) => {
                        const chosen = objectiveSchema.safeParse(value);
                        if (chosen.success) onChange(chosen.data);
                    }}
                    value={objective}
                >
                    <SelectTrigger className="w-auto" id={selectId}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {OBJECTIVE_OPTIONS.map((option) => (
                            <SelectItem
                                key={option.objective}
                                value={option.objective}
                            >
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <FieldDescription>
                {sizingObjectiveText(objective)}
            </FieldDescription>
            {note !== null && (
                <FieldDescription className="text-warning">
                    {note}
                </FieldDescription>
            )}
            {choiceNotes.map((choiceNote) => (
                <FieldDescription className="text-warning" key={choiceNote}>
                    {choiceNote}
                </FieldDescription>
            ))}
        </Field>
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
