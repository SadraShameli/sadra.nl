import { z } from 'zod';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    ALL_FIRMS,
    CENTS_PER_DOLLAR,
    dollars,
    type Dollars,
    floorToWholeCents,
    type Plan,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    type RulebookParameters,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import { PayoutPlannerUrlParameter } from '~/lib/schemas/payoutPlannerUrlParameter';

export interface PayoutPlannerUrlState {
    readonly balance: Dollars;
    readonly floorAtLastPayout: Dollars | null;
    readonly lastPayoutOn: null | string;
    readonly payoutsTaken: number;
    readonly peak: Dollars | null;
    readonly plan: Plan;
    readonly qualifyingDaysSinceLastPayout: number;
    readonly requestSize: Dollars;
    readonly stage: SizingStage.Funded;
}

const finiteNumberSchema = z.string().trim().min(1).pipe(z.coerce.number());

const dollarsSchema = finiteNumberSchema
    .pipe(z.number().nonnegative())
    .transform(floorToWholeCents)
    .pipe(z.number().nonnegative())
    .transform(dollars);

const positiveDollarsSchema = finiteNumberSchema
    .pipe(z.number().positive())
    .transform(floorToWholeCents)
    .pipe(z.number().positive())
    .transform(dollars);

const countSchema = finiteNumberSchema.pipe(z.number().int().nonnegative());

const isoDateSchema = z.iso.date();

const stageSchema = z.literal(SizingStage.Funded);

export function decodePayoutPlannerUrlState(
    parameters: URLSearchParams,
    firms: readonly TradingFirm[] = ALL_FIRMS,
    rulebook: RulebookParameters = DEFAULT_RULEBOOK,
): PayoutPlannerUrlState {
    const fallback = defaultPayoutPlannerUrlState(rulebook);
    const plan =
        planOf(parameters.get(PayoutPlannerUrlParameter.Plan), firms) ??
        fallback.plan;
    return {
        balance: parsed(
            positiveDollarsSchema,
            parameters.get(PayoutPlannerUrlParameter.Balance),
            fallback.balance,
        ),
        floorAtLastPayout: parsed(
            dollarsSchema,
            parameters.get(PayoutPlannerUrlParameter.FloorAtLastPayout),
            null,
        ),
        lastPayoutOn: parsed(
            isoDateSchema,
            parameters.get(PayoutPlannerUrlParameter.LastPayoutOn),
            null,
        ),
        payoutsTaken: parsed(
            countSchema,
            parameters.get(PayoutPlannerUrlParameter.Payouts),
            fallback.payoutsTaken,
        ),
        peak: parsed(
            positiveDollarsSchema,
            parameters.get(PayoutPlannerUrlParameter.Peak),
            null,
        ),
        plan,
        qualifyingDaysSinceLastPayout: parsed(
            countSchema,
            parameters.get(PayoutPlannerUrlParameter.QualifyingDays),
            fallback.qualifyingDaysSinceLastPayout,
        ),
        requestSize: urlRequestOf(parameters) ?? fallback.requestSize,
        stage: parsed(
            stageSchema,
            parameters.get(PayoutPlannerUrlParameter.Stage),
            fallback.stage,
        ),
    };
}

export function defaultPayoutPlannerUrlState(
    rulebook: RulebookParameters = DEFAULT_RULEBOOK,
): PayoutPlannerUrlState {
    const { plan } = defaultCalculatorState();
    return {
        balance: dollars(plan.accountSize),
        floorAtLastPayout: null,
        lastPayoutOn: null,
        payoutsTaken: 0,
        peak: null,
        plan,
        qualifyingDaysSinceLastPayout: 0,
        requestSize: payoutPlannerRulebookRequest(rulebook),
        stage: SizingStage.Funded,
    };
}

export function encodePayoutPlannerUrlState(
    state: PayoutPlannerUrlState,
    omitted: readonly PayoutPlannerUrlParameter[] = [],
): string {
    const parameters = new URLSearchParams();
    parameters.set(
        PayoutPlannerUrlParameter.Plan,
        serializePlanId(state.plan.id),
    );
    parameters.set(PayoutPlannerUrlParameter.Stage, state.stage);
    parameters.set(PayoutPlannerUrlParameter.Balance, String(state.balance));
    parameters.set(
        PayoutPlannerUrlParameter.RequestSize,
        String(state.requestSize),
    );
    parameters.set(
        PayoutPlannerUrlParameter.Payouts,
        String(state.payoutsTaken),
    );
    parameters.set(
        PayoutPlannerUrlParameter.QualifyingDays,
        String(state.qualifyingDaysSinceLastPayout),
    );
    if (state.peak !== null) {
        parameters.set(PayoutPlannerUrlParameter.Peak, String(state.peak));
    }
    if (state.floorAtLastPayout !== null) {
        parameters.set(
            PayoutPlannerUrlParameter.FloorAtLastPayout,
            String(state.floorAtLastPayout),
        );
    }
    if (state.lastPayoutOn !== null) {
        parameters.set(
            PayoutPlannerUrlParameter.LastPayoutOn,
            state.lastPayoutOn,
        );
    }
    for (const key of omitted) parameters.delete(key);
    return parameters.toString();
}

export function hasPayoutPlannerUrlRequest(
    parameters: URLSearchParams,
): boolean {
    return urlRequestOf(parameters) !== null;
}

export function parsePayoutPlannerBalance(raw: string): Dollars | null {
    return parsed(positiveDollarsSchema, raw, null);
}

export function parsePayoutPlannerCount(raw: string): null | number {
    return parsed(countSchema, raw, null);
}

export function parsePayoutPlannerDate(raw: string): null | string {
    return parsed(isoDateSchema, raw, null);
}

export function parsePayoutPlannerOptionalDollars(raw: string): Dollars | null {
    return parsed(dollarsSchema, raw, null);
}

export function payoutPlannerRulebookRequest(
    rulebook: RulebookParameters,
): Dollars {
    return dollars(rulebook.payout.requestCents / CENTS_PER_DOLLAR);
}

function parsed<T, F>(
    schema: z.ZodType<T>,
    raw: null | string,
    fallback: F,
): F | T {
    const result = schema.safeParse(raw);
    return result.success ? result.data : fallback;
}

function planOf(
    serial: null | string,
    firms: readonly TradingFirm[],
): null | Plan {
    if (serial === null) return null;
    for (const firm of firms) {
        const plan = firm.findPlanBySerial(serial);
        if (plan !== null) return plan;
    }
    return null;
}

function urlRequestOf(parameters: URLSearchParams): Dollars | null {
    return parsed(
        positiveDollarsSchema,
        parameters.get(PayoutPlannerUrlParameter.RequestSize),
        null,
    );
}
