import { RuleViolationKind } from '~/lib/prop-accounts/core';
import { type ExecutionDeviation } from '~/lib/trading/types';

export const EXECUTION_DEVIATION_VIOLATION_KIND: Readonly<
    Record<ExecutionDeviation, null | RuleViolationKind>
> = {
    'chased-entry': null,
    'entered-late': null,
    'exited-before-target': null,
    'exited-past-target': null,
    'moved-stop-early': null,
    'moved-stop-to-be': null,
    'no-fill': null,
    'sized-down': null,
    'sized-up': RuleViolationKind.Oversize,
};

export function executionDeviationViolationKindOf(
    deviation: ExecutionDeviation,
): null | RuleViolationKind {
    return EXECUTION_DEVIATION_VIOLATION_KIND[deviation];
}
