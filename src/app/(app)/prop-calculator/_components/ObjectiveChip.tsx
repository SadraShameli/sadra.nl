'use client';

import { useId } from 'react';
import { z } from 'zod';

import { StatusRow, StatusTone } from '~/components/StatusRow';
import { Field, FieldLabel } from '~/components/ui/field';
import InfoPopover from '~/components/ui/info-popover';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/select';
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

interface ObjectiveChipProperties extends ObjectiveNotesProperties {
    className?: string;
    objective: SizingObjective;
    onChange: (objective: SizingObjective) => void;
}

interface ObjectiveNotesProperties {
    choiceNotes?: readonly string[];
    note?: null | string;
}

interface ObjectiveSelectProperties {
    objective: SizingObjective;
    onChange: (objective: SizingObjective) => void;
}

export function CalculatorObjectiveChip({ className }: { className?: string }) {
    const chip = useCalculatorObjectiveChip();
    return <ObjectiveChip className={className} {...chip} />;
}

export function ObjectiveChip({
    choiceNotes = [],
    className,
    note = null,
    objective,
    onChange,
}: ObjectiveChipProperties) {
    return (
        <div
            className={cn(
                'app-prop-calculator__objective-chip flex flex-col gap-2',
                className,
            )}
        >
            <ObjectiveSelect objective={objective} onChange={onChange} />
            <ObjectiveNotes choiceNotes={choiceNotes} note={note} />
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

export function ObjectiveNotes({
    choiceNotes = [],
    note = null,
}: ObjectiveNotesProperties) {
    return (
        <>
            {note === null ? null : (
                <StatusRow title={note} tone={StatusTone.Warn} />
            )}
            {choiceNotes.map((choiceNote) => (
                <StatusRow
                    key={choiceNote}
                    title={choiceNote}
                    tone={StatusTone.Warn}
                />
            ))}
        </>
    );
}

export function ObjectiveSelect({
    objective,
    onChange,
}: ObjectiveSelectProperties) {
    const selectId = useId();
    return (
        <Field
            className="app-prop-calculator__objective-select w-auto max-w-full min-w-0 gap-2"
            orientation="horizontal"
        >
            <FieldLabel htmlFor={selectId}>{OBJECTIVE_SELECT_LABEL}</FieldLabel>
            <Select
                onValueChange={(value) => {
                    const chosen = objectiveSchema.safeParse(value);
                    if (chosen.success) onChange(chosen.data);
                }}
                value={objective}
            >
                <SelectTrigger className="w-auto min-w-0" id={selectId}>
                    <SelectValue>
                        {
                            OBJECTIVE_OPTIONS.find(
                                (option) => option.objective === objective,
                            )?.label
                        }
                    </SelectValue>
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
            <InfoPopover title={OBJECTIVE_SELECT_LABEL}>
                {sizingObjectiveText(objective)}
            </InfoPopover>
        </Field>
    );
}

export function useCalculatorObjectiveChip(): ObjectiveSelectProperties &
    Required<ObjectiveNotesProperties> {
    const { state } = useCalculatorInputs();
    const { dispatch } = useCalculatorActions();
    const choice = useObjectiveChoice();
    const view = riskTableObjective(state.objective);
    return {
        choiceNotes: objectiveChoiceNotes(choice, state.objective),
        note: view.note,
        objective: state.objective,
        onChange: (objective) =>
            dispatch({
                objective,
                type: CalculatorActionType.SetObjective,
            }),
    };
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
