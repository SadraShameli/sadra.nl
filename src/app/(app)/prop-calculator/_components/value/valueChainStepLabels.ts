import {
    VALUE_CHAIN_STEP_LABEL,
    type ValueChainStepKind,
} from '~/lib/prop-calculator/advisor/value';

export function stepAssumptionsHeading(kind: ValueChainStepKind): string {
    return `${VALUE_CHAIN_STEP_LABEL[kind]} assumptions`;
}
