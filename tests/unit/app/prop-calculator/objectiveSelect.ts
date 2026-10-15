import { OBJECTIVE_OPTIONS } from '~/app/(app)/prop-calculator/_components/objectiveRanking';
import {
    SIZING_OBJECTIVE_LABEL,
    type SizingObjective,
} from '~/lib/prop-calculator/advisor';

import { pickOption } from './accounts/pickOption';
import { labelledSelect, optionTexts, selectedText } from './labelledControl';

const OBJECTIVE_SELECT_LABEL = 'Ranking objective';

export function chosenObjective(scope: ParentNode): SizingObjective {
    const text = selectedText(objectiveSelect(scope));
    const option = OBJECTIVE_OPTIONS.find(
        (candidate) => candidate.label === text,
    );
    if (option === undefined) throw new Error(`no objective named ${text}`);
    return option.objective;
}

export function hasObjectiveSelect(scope: ParentNode): boolean {
    return [...scope.querySelectorAll('label')].some(
        (label) => label.textContent.trim() === OBJECTIVE_SELECT_LABEL,
    );
}

export async function objectiveOptionTexts(
    scope: ParentNode,
): Promise<string[]> {
    return optionTexts(objectiveSelect(scope));
}

export function objectiveSelect(scope: ParentNode): HTMLButtonElement {
    return labelledSelect(scope, OBJECTIVE_SELECT_LABEL);
}

export async function pickObjective(
    scope: ParentNode,
    objective: SizingObjective,
): Promise<void> {
    await pickOption(objectiveSelect(scope), SIZING_OBJECTIVE_LABEL[objective]);
}
