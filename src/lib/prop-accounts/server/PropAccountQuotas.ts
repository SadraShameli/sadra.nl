import { eq, sql } from 'drizzle-orm';
import { type PgColumn, type PgTable } from 'drizzle-orm/pg-core';
import 'server-only';

import {
    MAX_SAVED_SCENARIOS,
    PropLimitRejection,
    PropQuota,
    type PropRejection,
    type PropRejectionSource,
} from '~/lib/schemas/propAccountOutputs';
import {
    propAccount,
    propAccountEvent,
    propAccountSnapshot,
    propBankrollTransfer,
    propCopyGroup,
    propExternalFirm,
    propFee,
    propFirmEngagement,
    propFirmStatement,
    propPayout,
    propRound,
    propRuleViolation,
    propSavedScenario,
    propSizingDecision,
} from '~/server/db/schemas/prop';

import { type PropDatabase } from './PropAccountRepo';

export const PROP_QUOTA_LIMITS: Readonly<Record<PropQuota, number>> = {
    [PropQuota.Accounts]: 200,
    [PropQuota.BankrollTransfers]: 5000,
    [PropQuota.CopyGroups]: 50,
    [PropQuota.Decisions]: 20_000,
    [PropQuota.Events]: 50_000,
    [PropQuota.ExternalFirms]: 100,
    [PropQuota.Fees]: 5000,
    [PropQuota.FirmEngagements]: 200,
    [PropQuota.FirmStatements]: 5000,
    [PropQuota.Payouts]: 5000,
    [PropQuota.Rounds]: 500,
    [PropQuota.Scenarios]: MAX_SAVED_SCENARIOS,
    [PropQuota.Snapshots]: 20_000,
    [PropQuota.Violations]: 20_000,
};

const QUOTA_LABELS: Readonly<Record<PropQuota, string>> = {
    [PropQuota.Accounts]: 'accounts',
    [PropQuota.BankrollTransfers]: 'bankroll transfers',
    [PropQuota.CopyGroups]: 'copy groups',
    [PropQuota.Decisions]: 'sizing decisions',
    [PropQuota.Events]: 'account events',
    [PropQuota.ExternalFirms]: 'external firms',
    [PropQuota.Fees]: 'fees',
    [PropQuota.FirmEngagements]: 'firm statuses',
    [PropQuota.FirmStatements]: 'firm statements',
    [PropQuota.Payouts]: 'payouts',
    [PropQuota.Rounds]: 'rounds',
    [PropQuota.Scenarios]: 'saved scenarios',
    [PropQuota.Snapshots]: 'balance snapshots',
    [PropQuota.Violations]: 'rule violations',
};

export const PROP_MUTATIONS_PER_WINDOW = 60;
export const PROP_MUTATION_WINDOW_MS = 60_000;

const QUOTA_LOCK_PREFIX = 'prop-quota:';

interface QuotaTable {
    readonly table: PgTable;
    readonly userId: PgColumn;
}

export class PropQuotaExceededError
    extends Error
    implements PropRejectionSource
{
    readonly propRejection: PropRejection;

    constructor(
        readonly quota: PropQuota,
        readonly limit: number,
    ) {
        super(`You can keep at most ${limit} ${QUOTA_LABELS[quota]}`);
        this.name = 'PropQuotaExceededError';
        this.propRejection = {
            lifecycleRejection: null,
            limit,
            quota,
            reason: PropLimitRejection.QuotaExceeded,
            record: null,
            recordId: null,
        };
    }
}

const QUOTA_TABLES: Readonly<Record<PropQuota, QuotaTable>> = {
    [PropQuota.Accounts]: { table: propAccount, userId: propAccount.userId },
    [PropQuota.BankrollTransfers]: {
        table: propBankrollTransfer,
        userId: propBankrollTransfer.userId,
    },
    [PropQuota.CopyGroups]: {
        table: propCopyGroup,
        userId: propCopyGroup.userId,
    },
    [PropQuota.Decisions]: {
        table: propSizingDecision,
        userId: propSizingDecision.userId,
    },
    [PropQuota.Events]: {
        table: propAccountEvent,
        userId: propAccountEvent.userId,
    },
    [PropQuota.ExternalFirms]: {
        table: propExternalFirm,
        userId: propExternalFirm.userId,
    },
    [PropQuota.Fees]: { table: propFee, userId: propFee.userId },
    [PropQuota.FirmEngagements]: {
        table: propFirmEngagement,
        userId: propFirmEngagement.userId,
    },
    [PropQuota.FirmStatements]: {
        table: propFirmStatement,
        userId: propFirmStatement.userId,
    },
    [PropQuota.Payouts]: { table: propPayout, userId: propPayout.userId },
    [PropQuota.Rounds]: { table: propRound, userId: propRound.userId },
    [PropQuota.Scenarios]: {
        table: propSavedScenario,
        userId: propSavedScenario.userId,
    },
    [PropQuota.Snapshots]: {
        table: propAccountSnapshot,
        userId: propAccountSnapshot.userId,
    },
    [PropQuota.Violations]: {
        table: propRuleViolation,
        userId: propRuleViolation.userId,
    },
};

export class PropQuotaGuard {
    static async acquire(
        database: PropDatabase,
        userId: string,
    ): Promise<PropQuotaGuard> {
        await database.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${`${QUOTA_LOCK_PREFIX}${userId}`}, 0))`,
        );
        return new PropQuotaGuard(database, userId);
    }

    private constructor(
        private readonly database: PropDatabase,
        private readonly userId: string,
    ) {}

    async assertWithin(quota: PropQuota, adding: number): Promise<void> {
        const { table, userId: owner } = QUOTA_TABLES[quota];
        const stored = await this.database.$count(
            table,
            eq(owner, this.userId),
        );
        const limit = PROP_QUOTA_LIMITS[quota];
        if (stored + adding > limit) {
            throw new PropQuotaExceededError(quota, limit);
        }
    }
}
