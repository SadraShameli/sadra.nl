import { simInputsCacheKey } from '~/app/(app)/prop-calculator/_components/simInputsCacheKey';
import { type FirmId, type PlanOptIns } from '~/lib/prop-calculator';
import { type EnginePolicy, enginePolicyKey } from '~/lib/prop-calculator/advisor';
import {
    type FundedCandidateBuildKind,
    type FundedCandidateRefusalDetail,
    type FundedSweepRow,
} from '~/lib/prop-calculator/optimize';
import { type SimInputs } from '~/lib/prop-calculator/simulator';

export const MAX_FUNDED_SWEEP_TRIALS = 5000;

export type FundedSweepBaseInputs = Omit<
    SimInputs,
    'evalDayPolicy' | 'fundedDayPolicy' | 'plan'
>;

export interface FundedSweepBuiltResult {
    readonly kind: FundedCandidateBuildKind.Built;
    readonly notes: readonly string[];
    readonly rows: readonly FundedSweepRow[];
}

export interface FundedSweepProgress {
    readonly completed: number;
    readonly total: number;
}

export interface FundedSweepRefusedResult {
    readonly kind: FundedCandidateBuildKind.Refused;
    readonly refusal: FundedCandidateRefusalDetail;
}

export interface FundedSweepRequest {
    readonly base: FundedSweepBaseInputs;
    readonly firmId: FirmId;
    readonly optIns: PlanOptIns;
    readonly planSerial: string;
    readonly policy: EnginePolicy;
}

export type FundedSweepResult = FundedSweepBuiltResult | FundedSweepRefusedResult;

export function clampFundedSweepTrials(trials: number): number {
    return Math.min(trials, MAX_FUNDED_SWEEP_TRIALS);
}

export function fundedSweepCacheKey(request: FundedSweepRequest): string {
    return simInputsCacheKey(request.base, {
        extra: {
            firmId: request.firmId,
            optIns: request.optIns,
            planSerial: request.planSerial,
            policy: enginePolicyKey(request.policy),
        },
    });
}
