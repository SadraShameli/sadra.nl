import { ALL_FIRMS } from '~/lib/prop-calculator';
import {
    AlphaFuturesVariant,
    dollars,
    FirmId,
    MffuVariant,
    type Plan,
} from '~/lib/prop-calculator/core';
import {
    type FundedStateValueConfig,
    warmFirmsRegistryCache,
} from '~/lib/prop-calculator/core/FundedStateValue';

export const POOL_TEST_TIMEOUT_MS = 10_000;
export const POOL_TEST_WORKER_COUNT = 2;

export function coarseAlphaConfig(plan: Plan): FundedStateValueConfig {
    return {
        actionStepMultiple: 0.5,
        cushionStepMultiple: 0.5,
        cycleBestDayBucketCount: 2,
        evalInitialValue: 0,
        feePerAttempt: dollars(0),
        maxActionMultiple: 1,
        maxCushionMultiple: 2,
        maxTailCushionMultiple: 2,
        meanHorizonDays: 20,
        payoutRegimeCap: 1,
        plan,
        rrRatio: 2,
        tradesPerDay: 1,
        winrate: 0.5,
    };
}

export function coarseMffuProConfig(plan: Plan): FundedStateValueConfig {
    return { ...coarseAlphaConfig(plan), meanHorizonDays: 10 };
}

export async function registryAlphaStandard(): Promise<Plan> {
    await warmFirmsRegistryCache();
    const plan = ALL_FIRMS.find(
        (firm) => firm.id === FirmId.AlphaFutures,
    )?.findPlan({
        accountSize: 50_000,
        firm: FirmId.AlphaFutures,
        variant: AlphaFuturesVariant.Standard,
    });
    if (!plan) throw new Error('Alpha Futures Standard 50K plan not found');
    return plan;
}

export async function registryMffuPro(): Promise<Plan> {
    await warmFirmsRegistryCache();
    const plan = ALL_FIRMS.find((firm) => firm.id === FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (!plan) throw new Error('MFFU Pro 50K plan not found');
    return plan;
}

export async function registryTopStep(): Promise<Plan> {
    await warmFirmsRegistryCache();
    const plan = ALL_FIRMS.find((firm) => firm.id === FirmId.TopStep)?.plans[0];
    if (!plan) throw new Error('TopStep firm not registered');
    return plan;
}
