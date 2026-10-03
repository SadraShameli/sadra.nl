import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import 'server-only';

import {
    AccountEventKind,
    AccountStage,
    type AccountStageStarts,
    fundedSince,
    type LedgerAccount,
    PortfolioLedger,
} from '~/lib/prop-accounts';
import {
    type ListedAccount,
    PROP_QUOTA_LIMITS,
    type PropDatabase,
} from '~/lib/prop-accounts/server';
import { PropQuota } from '~/lib/schemas/propAccountOutputs';
import { propAccountEvent } from '~/server/db/schemas/prop';

export async function loadStageStarts(
    database: PropDatabase,
    userId: string,
    accounts: ReadonlyMap<string, ListedAccount>,
): Promise<ReadonlyMap<string, AccountStageStarts>> {
    const staged = accounts
        .values()
        .filter((account) => account.stage !== AccountStage.Eval)
        .toArray();
    if (staged.length === 0) return new Map();
    const stagedIds = staged.map((account) => account.id);
    const events = await database
        .select({
            accountId: propAccountEvent.accountId,
            createdAt: propAccountEvent.createdAt,
            id: propAccountEvent.id,
            kind: propAccountEvent.kind,
            occurredOn: propAccountEvent.occurredOn,
            userId: propAccountEvent.userId,
        })
        .from(propAccountEvent)
        .where(
            and(
                eq(propAccountEvent.userId, userId),
                inArray(propAccountEvent.accountId, stagedIds),
                ne(propAccountEvent.kind, AccountEventKind.Edited),
            ),
        )
        .orderBy(asc(propAccountEvent.occurredOn))
        .limit(PROP_QUOTA_LIMITS[PropQuota.Events]);
    const ledger = PortfolioLedger.fromRows(userId, {
        accounts: staged,
        events,
        fees: [],
        payouts: [],
    });
    return new Map(
        ledger.accounts.map((entry) => [
            entry.row.id,
            ledgerStageStarts(entry),
        ]),
    );
}

function ledgerStageStarts(entry: LedgerAccount): AccountStageStarts {
    return {
        evalPassedOn: fundedSince(entry)?.on ?? null,
        movedLiveOn:
            entry.transitions.find(
                (transition) => transition.to.stage === AccountStage.Live,
            )?.on ?? null,
    };
}
