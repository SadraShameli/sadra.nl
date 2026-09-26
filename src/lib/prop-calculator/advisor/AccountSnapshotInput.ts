import { z } from 'zod';

import { dollars, type Dollars, dollarsSchema } from '../core';
import { DashboardBalanceConvention } from './DashboardBalanceConvention';
import { SizingStage } from './SizingStage';

export interface AccountSnapshotInput {
    readonly asOf: string;
    readonly balance: Dollars;
    readonly balanceAtLastPayout?: Dollars | undefined;
    readonly cumulativePayout?: Dollars | undefined;
    readonly cycleBestDayProfit?: Dollars | undefined;
    readonly dashboardConvention: DashboardBalanceConvention;
    readonly dashboardFloor?: Dollars | undefined;
    readonly elapsedDaysSinceAttemptStart?: number | undefined;
    readonly evalBestDayProfit?: Dollars | undefined;
    readonly firstFundedTradeOn?: string | undefined;
    readonly floorAtLastPayout?: Dollars | undefined;
    readonly fundedOn?: string | undefined;
    readonly fundedResetsUsed?: number | undefined;
    readonly highestEodBalance?: Dollars | undefined;
    readonly highestIntradayBalance?: Dollars | undefined;
    readonly lastPayoutOn?: string | undefined;
    readonly lastTradedOn?: string | undefined;
    readonly liveStartBalance?: Dollars | undefined;
    readonly payoutsTaken?: number | undefined;
    readonly pendingPayouts?: Dollars | undefined;
    readonly purchasedOn?: string | undefined;
    readonly qualifyingDaysSinceLastPayout?: number | undefined;
    readonly stage: SizingStage;
    readonly tradingDays?: number | undefined;
}

const isoDateSchema = z.iso.date();

const countSchema = z.number().int().nonnegative();

const nonNegativeDollarsSchema = z.number().nonnegative().transform(dollars);

export const accountSnapshotInputSchema = z.strictObject({
    asOf: isoDateSchema,
    balance: dollarsSchema,
    balanceAtLastPayout: dollarsSchema.optional(),
    cumulativePayout: nonNegativeDollarsSchema.optional(),
    cycleBestDayProfit: nonNegativeDollarsSchema.optional(),
    dashboardConvention: z.enum(DashboardBalanceConvention),
    dashboardFloor: dollarsSchema.optional(),
    elapsedDaysSinceAttemptStart: countSchema.optional(),
    evalBestDayProfit: nonNegativeDollarsSchema.optional(),
    firstFundedTradeOn: isoDateSchema.optional(),
    floorAtLastPayout: dollarsSchema.optional(),
    fundedOn: isoDateSchema.optional(),
    fundedResetsUsed: countSchema.optional(),
    highestEodBalance: dollarsSchema.optional(),
    highestIntradayBalance: dollarsSchema.optional(),
    lastPayoutOn: isoDateSchema.optional(),
    lastTradedOn: isoDateSchema.optional(),
    liveStartBalance: nonNegativeDollarsSchema.optional(),
    payoutsTaken: countSchema.optional(),
    pendingPayouts: nonNegativeDollarsSchema.optional(),
    purchasedOn: isoDateSchema.optional(),
    qualifyingDaysSinceLastPayout: countSchema.optional(),
    stage: z.enum(SizingStage),
    tradingDays: countSchema.optional(),
}) satisfies z.ZodType<AccountSnapshotInput>;
