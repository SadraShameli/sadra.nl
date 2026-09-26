import { z } from 'zod';

import {
    findFirm,
    FirmId,
    parseFirmId,
    type Plan,
    type PlanOptIns,
    type TradingFirm,
    withPlanOptIns,
} from '~/lib/prop-calculator';

export enum AccountReadIssueKind {
    CorruptPersonalRules = 'corrupt-personal-rules',
    UnresolvablePlan = 'unresolvable-plan',
}

export enum PlanKeyResolutionKind {
    Resolved = 'resolved',
    Unresolved = 'unresolved',
}

export enum PlanOptIn {
    FundedReset = 'funded-reset',
    OneTimeEarlyWithdrawal = 'one-time-early-withdrawal',
}

export enum UnresolvedPlanReason {
    AccountSizeMismatch = 'account-size-mismatch',
    CorruptOptIns = 'corrupt-opt-ins',
    OptInNotOffered = 'opt-in-not-offered',
    UnknownFirm = 'unknown-firm',
    UnknownPlanSerial = 'unknown-plan-serial',
}

export const MAX_PLAN_SERIAL_LENGTH = 64;

export type AccountReadIssue =
    | { readonly kind: AccountReadIssueKind.CorruptPersonalRules }
    | {
          readonly kind: AccountReadIssueKind.UnresolvablePlan;
          readonly reason: UnresolvedPlanReason;
      };

export interface PlanKey {
    readonly accountSize: number;
    readonly firmId: FirmId;
    readonly optIns: PlanOptIns;
    readonly planSerial: string;
}

export type PlanKeyResolution =
    | { readonly kind: PlanKeyResolutionKind.Resolved; readonly plan: Plan }
    | {
          readonly kind: PlanKeyResolutionKind.Unresolved;
          readonly reason: UnresolvedPlanReason;
      };

export type StoredFirmId = FirmId | (string & {});

interface OptInRule {
    readonly field: keyof PlanOptIns;
    readonly isOffered: (plan: Plan) => boolean;
    readonly label: string;
}

const OPT_IN_RULES: Readonly<Record<PlanOptIn, OptInRule>> = {
    [PlanOptIn.FundedReset]: {
        field: 'takesFundedReset',
        isOffered: (plan) => plan.fundedReset !== null,
        label: 'funded reset',
    },
    [PlanOptIn.OneTimeEarlyWithdrawal]: {
        field: 'takesOneTimeEarlyWithdrawal',
        isOffered: (plan) => plan.oneTimeEarlyWithdrawal !== null,
        label: 'one-time early withdrawal',
    },
};

export type PlanKeyInput = Omit<PlanKey, 'firmId' | 'optIns'> & {
    readonly firmId: StoredFirmId;
    readonly optIns?: null | Partial<PlanOptIns>;
    readonly readIssues: readonly AccountReadIssue[];
};

type DetailedResolution =
    | { readonly kind: PlanKeyResolutionKind.Resolved; readonly plan: Plan }
    | {
          readonly kind: PlanKeyResolutionKind.Unresolved;
          readonly optIn: null | PlanOptIn;
          readonly reason: UnresolvedPlanReason;
      };

type PlanKeyText = Omit<PlanKeyInput, 'readIssues'>;

export const planOptInsSchema = z.object({
    takesFundedReset: z.boolean(),
    takesOneTimeEarlyWithdrawal: z.boolean(),
}) satisfies z.ZodType<PlanOptIns>;

export const storedPlanOptInsSchema = planOptInsSchema
    .partial()
    .transform((stored): PlanOptIns => ({
        takesFundedReset: stored.takesFundedReset === true,
        takesOneTimeEarlyWithdrawal:
            stored.takesOneTimeEarlyWithdrawal === true,
    }));

export const planKeyShape = {
    accountSize: z.number().int().positive(),
    firmId: z.enum(FirmId),
    optIns: planOptInsSchema,
    planSerial: z.string().min(1).max(MAX_PLAN_SERIAL_LENGTH),
};

export const planKeySchema = z
    .object(planKeyShape)
    .superRefine((key, context) => {
        refinePlanKey(key, context);
    });

export function describeAccountReadIssue(
    key: PlanKeyText,
    issue: AccountReadIssue,
): string {
    switch (issue.kind) {
        case AccountReadIssueKind.CorruptPersonalRules: {
            return 'The stored personal rules of this account are not valid';
        }
        case AccountReadIssueKind.UnresolvablePlan: {
            return describeUnresolvedPlan(key, issue.reason);
        }
    }
}

export function describePlanOptIn(optIn: PlanOptIn): string {
    return OPT_IN_RULES[optIn].label;
}

export function describeUnresolvedPlan(
    key: PlanKeyText,
    reason: UnresolvedPlanReason,
): string {
    switch (reason) {
        case UnresolvedPlanReason.AccountSizeMismatch: {
            return `Account size ${key.accountSize} does not match plan "${key.planSerial}"`;
        }
        case UnresolvedPlanReason.CorruptOptIns: {
            return `The stored opt-ins of plan "${key.planSerial}" are not valid`;
        }
        case UnresolvedPlanReason.OptInNotOffered: {
            return `Plan "${key.planSerial}" does not offer every selected opt-in`;
        }
        case UnresolvedPlanReason.UnknownFirm: {
            return `Unknown prop firm "${key.firmId}"`;
        }
        case UnresolvedPlanReason.UnknownPlanSerial: {
            return `Plan "${key.planSerial}" is not a plan of firm "${key.firmId}"`;
        }
    }
}

export function findStoredFirm(firmId: StoredFirmId): TradingFirm | undefined {
    const knownFirmId = parseFirmId(firmId);
    return knownFirmId === undefined ? undefined : findFirm(knownFirmId);
}

export function offeredPlanOptIns(plan: Plan): readonly PlanOptIn[] {
    return Object.values(PlanOptIn).filter((optIn) =>
        OPT_IN_RULES[optIn].isOffered(plan),
    );
}

export function planOptInField(optIn: PlanOptIn): keyof PlanOptIns {
    return OPT_IN_RULES[optIn].field;
}

export function refinePlanKey(
    key: PlanKey,
    context: z.RefinementCtx,
): null | Plan {
    const resolution = resolveDetailed({ ...key, readIssues: [] });
    if (resolution.kind === PlanKeyResolutionKind.Resolved) {
        return resolution.plan;
    }
    const reasonText = describeUnresolvedPlan(key, resolution.reason);
    context.addIssue({
        code: 'custom',
        message:
            resolution.optIn === null
                ? reasonText
                : `${reasonText}: ${describePlanOptIn(resolution.optIn)}`,
        path: issuePath(resolution.reason, resolution.optIn),
    });
    return null;
}

export function resolvePlanKey(key: PlanKeyInput): PlanKeyResolution {
    const resolution = resolveDetailed(key);
    return resolution.kind === PlanKeyResolutionKind.Resolved
        ? resolution
        : { kind: resolution.kind, reason: resolution.reason };
}

function flaggedPlanReason(
    readIssues: readonly AccountReadIssue[],
): null | UnresolvedPlanReason {
    const flagged = readIssues.find(
        (issue) => issue.kind === AccountReadIssueKind.UnresolvablePlan,
    );
    return flagged?.kind === AccountReadIssueKind.UnresolvablePlan
        ? flagged.reason
        : null;
}

function issuePath(
    reason: UnresolvedPlanReason,
    optIn: null | PlanOptIn,
): (number | string)[] {
    switch (reason) {
        case UnresolvedPlanReason.AccountSizeMismatch: {
            return ['accountSize'];
        }
        case UnresolvedPlanReason.CorruptOptIns: {
            return ['optIns'];
        }
        case UnresolvedPlanReason.OptInNotOffered: {
            return optIn === null
                ? ['optIns']
                : ['optIns', OPT_IN_RULES[optIn].field];
        }
        case UnresolvedPlanReason.UnknownFirm: {
            return ['firmId'];
        }
        case UnresolvedPlanReason.UnknownPlanSerial: {
            return ['planSerial'];
        }
    }
}

function resolveDetailed(key: PlanKeyInput): DetailedResolution {
    const flagged = flaggedPlanReason(key.readIssues);
    if (flagged !== null) return unresolved(flagged);
    const storedOptIns = storedPlanOptInsSchema.safeParse(
        key.optIns === undefined ? {} : key.optIns,
    );
    if (!storedOptIns.success) {
        return unresolved(UnresolvedPlanReason.CorruptOptIns);
    }
    const optIns = storedOptIns.data;
    const firm = findStoredFirm(key.firmId);
    if (firm === undefined) {
        return unresolved(UnresolvedPlanReason.UnknownFirm);
    }
    const plan = firm.findPlanBySerial(key.planSerial);
    if (plan === null) {
        return unresolved(UnresolvedPlanReason.UnknownPlanSerial);
    }
    if (key.accountSize !== plan.id.accountSize) {
        return unresolved(UnresolvedPlanReason.AccountSizeMismatch);
    }
    const unoffered = Object.values(PlanOptIn).find(
        (optIn) =>
            optIns[OPT_IN_RULES[optIn].field] &&
            !OPT_IN_RULES[optIn].isOffered(plan),
    );
    if (unoffered !== undefined) {
        return unresolved(UnresolvedPlanReason.OptInNotOffered, unoffered);
    }
    return {
        kind: PlanKeyResolutionKind.Resolved,
        plan: withPlanOptIns(plan, optIns),
    };
}

function unresolved(
    reason: UnresolvedPlanReason,
    optIn: null | PlanOptIn = null,
): DetailedResolution {
    return { kind: PlanKeyResolutionKind.Unresolved, optIn, reason };
}
