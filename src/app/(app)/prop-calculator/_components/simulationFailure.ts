import { errorMessage } from '~/lib/errorMessage';
import {
    SIM_INPUTS_REFUSAL_PREFIX,
    type SimInputsSizingInputs,
    simInputsSizingIssue,
} from '~/lib/prop-calculator/simulator';

import type { BaseSimulation, BaseSimulationRun } from './useBaseSimulation';

export interface SizingPartition<T> {
    accepted: T[];
    refused: SizingRefusal<T>[];
}

export interface SizingRefusal<T> {
    issue: string;
    item: T;
}

const BASE_SIMULATION_FAILED =
    'The simulation could not run for these inputs, so there is no result to show. Change an input to run it again.';

export function baseSimulationFailure(
    inputs: SimInputsSizingInputs,
    { isPending, result }: BaseSimulation,
): null | string {
    const refusal = simInputsSizingIssue(inputs);
    if (refusal !== null) return refusal;
    return !isPending && result === null ? BASE_SIMULATION_FAILED : null;
}

export function currentBaseFailure(
    inputs: SimInputsSizingInputs,
    { error, isPending, result }: BaseSimulationRun,
): null | string {
    return (
        (isPending ? null : error) ??
        baseSimulationFailure(inputs, { isPending, result })
    );
}

export function describeSimulationFailure(error: unknown): string {
    const message = errorMessage(error);
    return message.startsWith(SIM_INPUTS_REFUSAL_PREFIX)
        ? message.slice(SIM_INPUTS_REFUSAL_PREFIX.length)
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
