import { Badge } from '~/components/ui/badge';
import { type RunStatus } from '~/lib/accounting/runs/types';

const RUN_STATUS_LABEL: Readonly<Record<RunStatus, string>> = {
    failed: 'Failed',
    partial: 'Partly posted',
    planned: 'Planned',
    posted: 'Posted',
    posting: 'Posting',
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
    return <Badge>{runStatusLabel(status)}</Badge>;
}

export function runStatusLabel(status: RunStatus): string {
    return RUN_STATUS_LABEL[status];
}
