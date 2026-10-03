import { and, desc, eq } from 'drizzle-orm';
import 'server-only';
import { type z } from 'zod';

import { captureError } from '~/lib/observability/logger';
import { type DpAdviceRow } from '~/lib/prop-calculator/advisor';
import {
    dpAdviceGapsSchema,
    dpAdviceSamplesSchema,
} from '~/lib/prop-calculator/advisor/DpAdviceRow';
import {
    type DpValueSample,
    dpValueSamplesSchema,
    PropQuota,
} from '~/lib/schemas/propAccountOutputs';
import { propDpAdvice, type PropDpAdviceRow } from '~/server/db/schemas/prop';

import { PROP_QUOTA_LIMITS } from './PropAccountQuotas';
import { type PropDatabase } from './PropAccountRepo';

export const MAX_DP_ADVICE_ROWS_PER_ACCOUNT = 200;

const CORRUPT_ROW_TAG = 'prop-accounts:corrupt-row';

export type DpAdviceRecord = Omit<
    PropDpAdviceRow,
    'gaps' | 'samples' | 'valueSamples'
> & {
    readonly gaps: z.output<typeof dpAdviceGapsSchema>;
    readonly samples: z.output<typeof dpAdviceSamplesSchema>;
    readonly valueSamples: z.output<typeof dpValueSamplesSchema>;
};

export class DpAdviceRepo {
    constructor(
        private readonly database: PropDatabase,
        private readonly userId: string,
    ) {}

    async latestPerAccount(): Promise<DpAdviceRecord[]> {
        const rows = await this.database
            .selectDistinctOn([propDpAdvice.accountId])
            .from(propDpAdvice)
            .where(eq(propDpAdvice.userId, this.userId))
            .orderBy(
                propDpAdvice.accountId,
                desc(propDpAdvice.solvedAt),
                desc(propDpAdvice.id),
            )
            .limit(PROP_QUOTA_LIMITS[PropQuota.Accounts]);
        return readableRecords(rows);
    }

    async listForAccount(accountId: string): Promise<DpAdviceRecord[]> {
        const rows = await this.database
            .select()
            .from(propDpAdvice)
            .where(
                and(
                    eq(propDpAdvice.userId, this.userId),
                    eq(propDpAdvice.accountId, accountId),
                ),
            )
            .orderBy(desc(propDpAdvice.solvedAt), desc(propDpAdvice.id))
            .limit(MAX_DP_ADVICE_ROWS_PER_ACCOUNT);
        return readableRecords(rows);
    }

    async record(
        accountId: string,
        row: DpAdviceRow,
        valueSamples: readonly DpValueSample[],
    ): Promise<DpAdviceRecord | null> {
        const [stored] = await this.database
            .insert(propDpAdvice)
            .values({
                accountId,
                assumedInstrument: row.assumedInstrument,
                assumedStopPoints: row.assumedStopPoints,
                configKey: row.configKey,
                eligible: row.eligible,
                gaps: row.gaps,
                gateFailure: row.gateFailure,
                gateResult: row.gateResult,
                ineligibleReason: row.ineligibleReason,
                objective: row.objective,
                planRulesFingerprint: row.planRulesFingerprint,
                planSerial: row.planSerial,
                runtimeMs: row.runtimeMs,
                samples: row.samples,
                snapshotId: row.snapshotId,
                solvedAt: new Date(row.solvedAt),
                solverVersion: row.solverVersion,
                userId: this.userId,
                validated: row.validated,
                validationRef: row.validationRef,
                valueSamples,
            })
            .onConflictDoNothing()
            .returning();
        return stored === undefined ? null : readRecord(stored);
    }
}

function readableRecords(rows: readonly PropDpAdviceRow[]): DpAdviceRecord[] {
    return rows.flatMap((row) => {
        const record = readRecord(row);
        return record === null ? [] : [record];
    });
}

function readRecord(row: PropDpAdviceRow): DpAdviceRecord | null {
    const gaps = dpAdviceGapsSchema.safeParse(row.gaps);
    const samples = dpAdviceSamplesSchema.safeParse(row.samples);
    const valueSamples = dpValueSamplesSchema.safeParse(row.valueSamples);
    if (gaps.success && samples.success && valueSamples.success) {
        return {
            ...row,
            gaps: gaps.data,
            samples: samples.data,
            valueSamples: valueSamples.data,
        };
    }
    const unreadable = [
        gaps.success ? [] : ['gaps'],
        samples.success ? [] : ['samples'],
        valueSamples.success ? [] : ['value_samples'],
    ].flat();
    captureError(
        new Error(
            `Stored DP advice row has unreadable ${unreadable.join(', ')}`,
        ),
        {
            fields: { accountId: row.accountId, adviceId: row.id },
            tag: CORRUPT_ROW_TAG,
        },
    );
    return null;
}
