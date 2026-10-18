import type { RunOutcome, RunStatus } from '~/lib/accounting/runs/types';

export const LOCKED_RUN_STATUSES = [
    'posted',
    'posting',
] as const satisfies readonly RunStatus[];

export const POSTED_OUTCOME = 'posted' satisfies RunOutcome['status'];

export function canEditBooking(
    run: { outcomes: Record<string, RunOutcome>; status: RunStatus },
    txnId: string,
): boolean {
    return (
        LOCKED_RUN_STATUSES.every((status) => status !== run.status) &&
        run.outcomes[txnId]?.status !== POSTED_OUTCOME
    );
}
