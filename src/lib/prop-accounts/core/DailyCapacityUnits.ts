import type { propAccount } from '~/server/db/schemas/prop';

import { AccountStatus } from './AccountStatus';

type ActiveAccountRow = Pick<
    typeof propAccount.$inferSelect,
    'archivedAt' | 'status'
>;

type DailyCapacityRow = ActiveAccountRow &
    Pick<typeof propAccount.$inferSelect, 'copyGroupId'>;

export function dailyCapacityUnitsOf(
    rows: readonly DailyCapacityRow[],
): number {
    const groups = new Set<string>();
    let standalone = 0;
    for (const row of rows) {
        if (!isActiveAccountRow(row)) continue;
        if (row.copyGroupId === null) {
            standalone += 1;
        } else {
            groups.add(row.copyGroupId);
        }
    }
    return standalone + groups.size;
}

export function isActiveAccountRow(row: ActiveAccountRow): boolean {
    return row.status === AccountStatus.Active && row.archivedAt === null;
}
