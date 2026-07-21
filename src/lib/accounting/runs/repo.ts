import { and, desc, eq, sql } from 'drizzle-orm';
import 'server-only';

import type { Booking } from '~/lib/accounting/core/types';
import type {
    RunOutcome,
    RunStatus,
    RunSummary,
} from '~/lib/accounting/runs/types';

import { CredentialId, RunId, UserId } from '~/lib/accounting/core/ids';
import { canEditBooking } from '~/lib/accounting/runs/edit-policy';
import { accountingRun, db } from '~/server/db';

export interface AccountingRun {
    accountingCredentialId: CredentialId | null;
    apiCredentialIds: CredentialId[];
    bookings: Booking[];
    createdAt: Date;
    errorMessage: null | string;
    id: RunId;
    outcomes: Record<string, RunOutcome>;
    startDate: string;
    status: RunStatus;
    summary: RunSummary;
    updatedAt: Date;
    userId: UserId;
}

export interface CreateRunInput {
    accountingCredentialId: string | undefined;
    apiCredentialIds: readonly string[];
    bookings: Booking[];
    startDate: string;
    summary: RunSummary;
    userId: string;
}

export class AccountingRunRepo {
    async create(input: CreateRunInput): Promise<RunId> {
        const [row] = await db
            .insert(accountingRun)
            .values({
                accountingCredentialId: input.accountingCredentialId ?? null,
                apiCredentialIds: [...input.apiCredentialIds],
                bookings: input.bookings,
                startDate: input.startDate,
                status: 'planned',
                summary: input.summary,
                userId: input.userId,
            })
            .returning({ id: accountingRun.id });
        if (!row) {
            throw new Error('Could not create accounting run');
        }
        return RunId(row.id);
    }

    async get(id: RunId, userId: UserId): Promise<AccountingRun | null> {
        const [row] = await db
            .select()
            .from(accountingRun)
            .where(
                and(eq(accountingRun.id, id), eq(accountingRun.userId, userId)),
            )
            .limit(1);
        return row ? toAccountingRun(row) : null;
    }

    async list(
        userId: UserId,
        options: { limit?: number; offset?: number } = {},
    ): Promise<AccountingRun[]> {
        const rows = await db
            .select()
            .from(accountingRun)
            .where(eq(accountingRun.userId, userId))
            .orderBy(desc(accountingRun.createdAt))
            .limit(options.limit ?? 20)
            .offset(options.offset ?? 0);
        return rows.map(toAccountingRun);
    }

    async recordOutcome(
        id: RunId,
        userId: UserId,
        txnId: string,
        outcome: RunOutcome,
    ): Promise<void> {
        const patch = JSON.stringify({ [txnId]: outcome });
        await db
            .update(accountingRun)
            .set({
                outcomes: sql`${accountingRun.outcomes} || ${patch}::jsonb`,
                updatedAt: new Date(),
            })
            .where(
                and(eq(accountingRun.id, id), eq(accountingRun.userId, userId)),
            );
    }

    async setStatus(
        id: RunId,
        userId: UserId,
        status: RunStatus,
        errorMessage?: string,
    ): Promise<void> {
        await db
            .update(accountingRun)
            .set({
                errorMessage: errorMessage ?? null,
                status,
                updatedAt: new Date(),
            })
            .where(
                and(eq(accountingRun.id, id), eq(accountingRun.userId, userId)),
            );
    }

    async updateBooking(
        id: RunId,
        userId: UserId,
        txnId: string,
        patch: Partial<
            Pick<
                Booking,
                | 'counterpartLedger'
                | 'counterpartName'
                | 'direction'
                | 'isRefund'
                | 'taxCode'
            >
        >,
    ): Promise<void> {
        const run = await this.get(id, userId);
        if (!run) {
            throw new Error('Run not found');
        }
        if (!canEditBooking(run, txnId)) {
            throw new Error(
                `Cannot edit booking "${txnId}" on a run with status "${run.status}"`,
            );
        }
        const bookings = run.bookings.map((b) =>
            b.txnId === txnId ? { ...b, ...patch } : b,
        );
        await db
            .update(accountingRun)
            .set({ bookings, updatedAt: new Date() })
            .where(
                and(eq(accountingRun.id, id), eq(accountingRun.userId, userId)),
            );
    }
}

export const accountingRunRepo = new AccountingRunRepo();

function toAccountingRun(
    row: typeof accountingRun.$inferSelect,
): AccountingRun {
    return {
        accountingCredentialId: row.accountingCredentialId
            ? CredentialId(row.accountingCredentialId)
            : null,
        apiCredentialIds: row.apiCredentialIds.map((id) => CredentialId(id)),
        bookings: row.bookings,
        createdAt: row.createdAt,
        errorMessage: row.errorMessage,
        id: RunId(row.id),
        outcomes: row.outcomes,
        startDate: row.startDate,
        status: row.status,
        summary: row.summary,
        updatedAt: row.updatedAt,
        userId: UserId(row.userId),
    };
}
