import 'server-only';
import { z } from 'zod';

import {
    type DpAdviceRecord,
    DpAdviceRepo,
    PropAccountRepo,
    withPlanRulesChanged,
} from '~/lib/prop-accounts/server';
import { dpAdviceStaleness } from '~/lib/prop-calculator/advisor';
import { propDpAdviceOutputSchema } from '~/lib/schemas/propAccountOutputs';
import { accountIdSchema } from '~/lib/schemas/propAccounts';
import { createTRPCRouter } from '~/server/api/trpc';
import { type PropAccountSnapshotRow } from '~/server/db/schemas/prop';

import { propProcedure } from './mutationGuard';

const UNKNOWN_CURRENT_VALUE = '';

type AccountWithFingerprint = Awaited<
    ReturnType<typeof withPlanRulesChanged>
>[number];

export const propDpAdviceRouter = createTRPCRouter({
    latestForAll: propProcedure
        .output(z.array(propDpAdviceOutputSchema))
        .query(async ({ ctx }) => {
            const records = await new DpAdviceRepo(
                ctx.db,
                ctx.userId,
            ).latestPerAccount();
            if (records.length === 0) return [];
            const repo = new PropAccountRepo(ctx.db, ctx.userId);
            const [accounts, snapshots] = await Promise.all([
                repo.listAccounts({ includeArchived: true }),
                repo.latestSnapshots(),
            ]);
            return withStaleness(
                records,
                snapshots,
                await withPlanRulesChanged(accounts),
            );
        }),

    listForAccount: propProcedure
        .input(accountIdSchema)
        .output(z.array(propDpAdviceOutputSchema))
        .query(async ({ ctx, input }) => {
            const repo = new PropAccountRepo(ctx.db, ctx.userId);
            const account = await repo.loadListedAccountOrThrow(input.id);
            const records = await new DpAdviceRepo(
                ctx.db,
                ctx.userId,
            ).listForAccount(account.id);
            return records.length === 0
                ? []
                : withStaleness(
                      records,
                      await repo.latestSnapshots(),
                      await withPlanRulesChanged([account]),
                  );
        }),
});

function withStaleness(
    records: readonly DpAdviceRecord[],
    latestSnapshots: readonly Pick<
        PropAccountSnapshotRow,
        'accountId' | 'id'
    >[],
    accounts: readonly Pick<
        AccountWithFingerprint,
        'currentPlanRulesFingerprint' | 'id'
    >[],
) {
    const snapshotIds = new Map(
        latestSnapshots.map((snapshot) => [snapshot.accountId, snapshot.id]),
    );
    const fingerprints = new Map(
        accounts.map((account) => [
            account.id,
            account.currentPlanRulesFingerprint,
        ]),
    );
    return records.map((record) => ({
        ...record,
        staleness: [
            ...dpAdviceStaleness(record, {
                currentPlanRulesFingerprint:
                    fingerprints.get(record.accountId) ?? UNKNOWN_CURRENT_VALUE,
                latestSnapshotId:
                    snapshotIds.get(record.accountId) ?? UNKNOWN_CURRENT_VALUE,
            }),
        ],
    }));
}
