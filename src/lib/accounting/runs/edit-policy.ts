import type { RunOutcome, RunStatus } from '~/lib/accounting/runs/types';

export function canEditBooking(
    run: { outcomes: Record<string, RunOutcome>; status: RunStatus },
    txnId: string,
): boolean {
    return (
        run.status !== 'posted' &&
        run.status !== 'posting' &&
        run.outcomes[txnId]?.status !== 'posted'
    );
}
