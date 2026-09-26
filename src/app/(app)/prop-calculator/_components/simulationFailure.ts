import { errorMessage } from '~/lib/errorMessage';
import {
    type SimInputsSizingInputs,
    simInputsSizingIssue,
} from '~/lib/prop-calculator/simulator';

export interface SizingPartition<T> {
    accepted: T[];
    refused: SizingRefusal<T>[];
}

export interface SizingRefusal<T> {
    issue: string;
    item: T;
}

const ENGINE_INPUT_PREFIX = 'Invalid SimInputs: ';

export function describeSimulationFailure(error: unknown): string {
    const message = errorMessage(error);
    return message.startsWith(ENGINE_INPUT_PREFIX)
        ? message.slice(ENGINE_INPUT_PREFIX.length)
        : message;
}

export function partitionBySizing<T>(
    items: readonly T[],
    inputsOf: (item: T) => SimInputsSizingInputs,
): SizingPartition<T> {
    const accepted: T[] = [];
    const refused: SizingRefusal<T>[] = [];
    for (const item of items) {
        const issue = simInputsSizingIssue(inputsOf(item));
        if (issue === null) accepted.push(item);
        else refused.push({ issue, item });
    }
    return { accepted, refused };
}
