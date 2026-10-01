import { type PayoutPlannerOutlook } from '~/app/(app)/prop-calculator/_components/payoutPlanner/payoutPlannerModel';
import { findFirm, type FirmId, type Plan } from '~/lib/prop-calculator';
import {
    type DocumentedPolicySpec,
    enginePolicyKey,
    type PayoutSizeSweepResult,
} from '~/lib/prop-calculator/advisor';
import { stableJson } from '~/lib/stableJson';

export interface PayoutOutlookRequest {
    readonly asOf: string;
    readonly balance: number;
    readonly firmId: FirmId;
    readonly floorAtLastPayout: null | number;
    readonly isEligible: boolean;
    readonly lastPayoutOn: null | string;
    readonly payoutsTaken: number;
    readonly peak: null | number;
    readonly planSerial: string;
    readonly qualifyingDaysSinceLastPayout: number;
    readonly requestSize: number;
    readonly spec: DocumentedPolicySpec;
}

export type PayoutOutlookResult = PayoutPlannerOutlook;

export interface PayoutSweepRequest {
    readonly firmId: FirmId;
    readonly personalOverrideRequest?: null | number;
    readonly planSerial: string;
    readonly spec: DocumentedPolicySpec;
}

export type PayoutSweepResult = PayoutSizeSweepResult;

export function payoutOutlookCacheKey(request: PayoutOutlookRequest): string {
    return stableJson({
        asOf: request.asOf,
        balance: request.balance,
        firmId: request.firmId,
        floorAtLastPayout: request.floorAtLastPayout,
        isEligible: request.isEligible,
        lastPayoutOn: request.lastPayoutOn,
        payoutsTaken: request.payoutsTaken,
        peak: request.peak,
        planSerial: request.planSerial,
        policy: enginePolicyKey(request.spec.enginePolicy),
        qualifyingDaysSinceLastPayout: request.qualifyingDaysSinceLastPayout,
        requestSize: request.requestSize,
        rulebook: request.spec.rulebook,
        run: request.spec.run,
    });
}

export function payoutOutlookPlan(request: PayoutOutlookRequest): null | Plan {
    return planFor(request.firmId, request.planSerial);
}

export function payoutSweepCacheKey(request: PayoutSweepRequest): string {
    return stableJson({
        firmId: request.firmId,
        personalOverrideRequest: request.personalOverrideRequest ?? null,
        planSerial: request.planSerial,
        policy: enginePolicyKey(request.spec.enginePolicy),
        rulebook: request.spec.rulebook,
        run: request.spec.run,
        start: request.spec.start ?? null,
    });
}

export function payoutSweepPlan(request: PayoutSweepRequest): null | Plan {
    return planFor(request.firmId, request.planSerial);
}

function planFor(firmId: FirmId, planSerial: string): null | Plan {
    return findFirm(firmId)?.findPlanBySerial(planSerial) ?? null;
}
