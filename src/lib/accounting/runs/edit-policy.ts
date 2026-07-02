import type { RunOutcome, RunStatus } from '~/lib/accounting/runs/types';

export function canEditBooking(
    run: { outcomes: Record<string, RunOutcome>; status: RunStatus },
    txnId: string,
): boolean {
    if (run.status === 'posted' || run.status === 'posting') return false;
    return run.outcomes[txnId]?.status !== 'posted';
}
