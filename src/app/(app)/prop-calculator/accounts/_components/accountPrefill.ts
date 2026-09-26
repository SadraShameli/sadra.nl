import { z } from 'zod';

import { planKeySchema, PlanOptIn, planOptInField } from '~/lib/prop-accounts';
import {
    findFirm,
    FirmId,
    NO_PLAN_OPT_INS,
    type Plan,
    type PlanOptIns,
    serializePlanId,
} from '~/lib/prop-calculator';
import { CalculatorUrlParameter, UrlFlag } from '~/lib/schemas/url';
import { routes } from '~/lib/site/routes';

import { keepOfferedOptIns } from './accountPlanOptions';

export interface AccountPrefill {
    readonly firmId: FirmId | null;
    readonly optIns: PlanOptIns;
    readonly planSerial: null | string;
}

export type AccountPrefillParameters = Readonly<
    Record<string, readonly string[] | string | undefined>
>;

export const EMPTY_ACCOUNT_PREFILL: AccountPrefill = {
    firmId: null,
    optIns: NO_PLAN_OPT_INS,
    planSerial: null,
};

const OPT_IN_PARAMETERS: Readonly<Record<PlanOptIn, CalculatorUrlParameter>> = {
    [PlanOptIn.FundedReset]: CalculatorUrlParameter.FundedReset,
    [PlanOptIn.OneTimeEarlyWithdrawal]: CalculatorUrlParameter.EarlyWithdrawal,
};

const optInFlagSchema = z
    .string()
    .optional()
    .transform((flag) => flag === UrlFlag.On);

const prefillQuerySchema = z.object({
    [CalculatorUrlParameter.EarlyWithdrawal]: optInFlagSchema,
    [CalculatorUrlParameter.Firm]: z.enum(FirmId).optional().catch(undefined),
    [CalculatorUrlParameter.FundedReset]: optInFlagSchema,
    [CalculatorUrlParameter.Plan]: z.string().optional(),
});

export function accountPrefillHref(
    firmId: FirmId,
    plan: Plan,
    optIns: PlanOptIns,
): string {
    const query = accountPrefillQuery(
        validatedPrefill(firmId, serializePlanId(plan.id), optIns),
    );
    const base = routes.propCalculator.accounts.new;
    return query === '' ? base : `${base}?${query}`;
}

export function accountPrefillQuery(prefill: AccountPrefill): string {
    const query = new URLSearchParams();
    if (prefill.firmId !== null) {
        query.set(CalculatorUrlParameter.Firm, prefill.firmId);
    }
    if (prefill.planSerial !== null) {
        query.set(CalculatorUrlParameter.Plan, prefill.planSerial);
    }
    for (const optIn of Object.values(PlanOptIn)) {
        if (prefill.optIns[planOptInField(optIn)]) {
            query.set(OPT_IN_PARAMETERS[optIn], UrlFlag.On);
        }
    }
    return query.toString();
}

export function parseAccountPrefill(
    parameters: AccountPrefillParameters,
): AccountPrefill {
    const query = prefillQuerySchema.parse({
        [CalculatorUrlParameter.EarlyWithdrawal]: firstValue(
            parameters[CalculatorUrlParameter.EarlyWithdrawal],
        ),
        [CalculatorUrlParameter.Firm]: firstValue(
            parameters[CalculatorUrlParameter.Firm],
        ),
        [CalculatorUrlParameter.FundedReset]: firstValue(
            parameters[CalculatorUrlParameter.FundedReset],
        ),
        [CalculatorUrlParameter.Plan]: firstValue(
            parameters[CalculatorUrlParameter.Plan],
        ),
    });
    const firmId = query[CalculatorUrlParameter.Firm];
    if (firmId === undefined) return EMPTY_ACCOUNT_PREFILL;
    const planSerial = query[CalculatorUrlParameter.Plan];
    if (planSerial === undefined) {
        return { ...EMPTY_ACCOUNT_PREFILL, firmId };
    }
    return validatedPrefill(firmId, planSerial, {
        takesFundedReset: query[CalculatorUrlParameter.FundedReset],
        takesOneTimeEarlyWithdrawal:
            query[CalculatorUrlParameter.EarlyWithdrawal],
    });
}

function firstValue(
    value: readonly string[] | string | undefined,
): string | undefined {
    return typeof value === 'string' ? value : value?.[0];
}

function validatedPrefill(
    firmId: FirmId,
    planSerial: string,
    optIns: PlanOptIns,
): AccountPrefill {
    const firm = findFirm(firmId);
    if (firm === undefined) return EMPTY_ACCOUNT_PREFILL;
    const firmOnly = { ...EMPTY_ACCOUNT_PREFILL, firmId };
    const plan = firm.findPlanBySerial(planSerial);
    if (plan === null) return firmOnly;
    const parsed = planKeySchema.safeParse({
        accountSize: plan.id.accountSize,
        firmId,
        optIns: keepOfferedOptIns(plan, optIns),
        planSerial,
    });
    return parsed.success
        ? { firmId, optIns: parsed.data.optIns, planSerial }
        : firmOnly;
}
