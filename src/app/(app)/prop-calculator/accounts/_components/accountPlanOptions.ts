import { formatCompactCurrency, formatCurrency } from '~/lib/format';
import {
    AccountStage,
    describePlanOptIn,
    formatUsdCents,
    offeredPlanOptIns,
    type PersonalRules,
    personalRulesSchema,
    type PlanOptIn,
    planOptInField,
    type UsdCents,
    usdCentsToDollars,
    usdCentsToText,
    validateStageForPlan,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    type FirmId,
    NO_PLAN_OPT_INS,
    type Plan,
    PlanAvailability,
    type PlanOptIns,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';

import {
    EntryTextKind,
    parseCountText,
    parseMoneyText,
} from './snapshotFieldRules';

export { formatUsdCents, usdCentsToText } from '~/lib/prop-accounts';

export enum AccountPlanTag {
    CallUpOnly = 'call-up-only',
    InstantFunded = 'instant-funded',
}

export const DISPLAYED_ACCOUNT_SIZES: readonly number[] = [
    25_000, 50_000, 100_000, 150_000,
];

const CENTS_FRACTION_DIGITS = 2;

const PLAN_TAG_LABEL: Readonly<Record<AccountPlanTag, string>> = {
    [AccountPlanTag.CallUpOnly]: 'call-up only',
    [AccountPlanTag.InstantFunded]: 'instant funded',
};

const STAGE_LABEL: Readonly<Record<AccountStage, string>> = {
    [AccountStage.Eval]: 'Evaluation',
    [AccountStage.Funded]: 'Funded',
    [AccountStage.Live]: 'Live',
};

export interface AccountFirmOption {
    readonly firmId: FirmId;
    readonly label: string;
}

export interface AccountOptInOption {
    readonly field: keyof PlanOptIns;
    readonly label: string;
    readonly optIn: PlanOptIn;
}

export interface AccountPlanOption {
    readonly label: string;
    readonly planSerial: string;
    readonly tags: readonly AccountPlanTag[];
}

export interface AccountPlanSelection {
    readonly accountSize: number;
    readonly firmId: FirmId;
    readonly optIns: PlanOptIns;
    readonly planSerial: string;
}

export interface AccountSizeOption {
    readonly accountSize: number;
    readonly isModeled: boolean;
    readonly label: string;
    readonly planSerial: null | string;
}

export interface AccountStageOption {
    readonly label: string;
    readonly stage: AccountStage;
}

export interface ParsedPersonalRules {
    readonly issues: ReadonlyMap<PersonalRuleKey, string>;
    readonly rules: PersonalRules;
}

export interface PersonalRuleField {
    readonly hint: string;
    readonly isMoney: boolean;
    readonly key: PersonalRuleKey;
    readonly label: string;
}

export type PersonalRuleKey = keyof PersonalRules;

export type PersonalRulesText = Readonly<Record<PersonalRuleKey, string>>;

type IsMoneyRule<K extends PersonalRuleKey> =
    NonNullable<PersonalRules[K]> extends UsdCents ? true : false;

interface PersonalRuleText<K extends PersonalRuleKey> {
    readonly hint: string;
    readonly isMoney: IsMoneyRule<K>;
    readonly label: string;
}

const PERSONAL_RULE_TEXT: {
    readonly [K in PersonalRuleKey]-?: PersonalRuleText<K>;
} = {
    dailyLossLimitCents: {
        hint: 'Your own daily loss limit, tighter than the firm’s.',
        isMoney: true,
        label: 'Daily loss limit',
    },
    dailyProfitCapCents: {
        hint: 'Stop trading for the day once this profit is reached.',
        isMoney: true,
        label: 'Daily profit cap',
    },
    maxRiskPerTradeCents: {
        hint: 'Your own cap on the dollar risk of one trade. Only ever tightens the documented rule.',
        isMoney: true,
        label: 'Max risk per trade',
    },
    maxTradesPerDay: {
        hint: 'At most this many trades in one day.',
        isMoney: false,
        label: 'Trades per day',
    },
    payoutRequestOverrideCents: {
        hint: 'Replaces the rulebook payout size for this account. The firm minimum still applies.',
        isMoney: true,
        label: 'Payout request size',
    },
    retainedCushionCents: {
        hint: 'Cushion you keep above the floor after any payout. Only a larger value than the rulebook tightens it.',
        isMoney: true,
        label: 'Retained cushion',
    },
};

const PERSONAL_RULE_ORDER: readonly PersonalRuleKey[] = [
    'maxRiskPerTradeCents',
    'dailyLossLimitCents',
    'dailyProfitCapCents',
    'maxTradesPerDay',
    'retainedCushionCents',
    'payoutRequestOverrideCents',
];

const PERSONAL_RULE_KEY_SCHEMA = personalRulesSchema.keyof();

export const PERSONAL_RULE_FIELDS: readonly PersonalRuleField[] =
    PERSONAL_RULE_ORDER.map((key) => ({ ...PERSONAL_RULE_TEXT[key], key }));

export const EMPTY_PERSONAL_RULES_TEXT: PersonalRulesText = {
    dailyLossLimitCents: '',
    dailyProfitCapCents: '',
    maxRiskPerTradeCents: '',
    maxTradesPerDay: '',
    payoutRequestOverrideCents: '',
    retainedCushionCents: '',
};

export function accountFirmOptions(): readonly AccountFirmOption[] {
    return ALL_FIRMS.map((firm) => ({
        firmId: firm.id,
        label: firm.displayName,
    }));
}

export function accountOptInOptions(plan: Plan): readonly AccountOptInOption[] {
    return offeredPlanOptIns(plan).map((optIn) => ({
        field: planOptInField(optIn),
        label: describePlanOptIn(optIn),
        optIn,
    }));
}

export function accountPlanOptions(
    firm: TradingFirm,
): readonly AccountPlanOption[] {
    return firm.plans.map((plan) => ({
        label: plan.label,
        planSerial: serializePlanId(plan.id),
        tags: planTags(plan),
    }));
}

export function accountSizeOptions(
    firm: TradingFirm,
    plan: Plan,
): readonly AccountSizeOption[] {
    const family = variantKey(plan);
    const siblings = new Map<number, Plan>();
    for (const candidate of firm.plans) {
        if (variantKey(candidate) !== family) continue;
        siblings.set(candidate.id.accountSize, candidate);
    }
    siblings.set(plan.id.accountSize, plan);
    const sizes = new Set([...DISPLAYED_ACCOUNT_SIZES, ...siblings.keys()]);
    return [...sizes]
        .toSorted((a, b) => a - b)
        .map((accountSize) => {
            const sibling = siblings.get(accountSize);
            const sizeLabel = formatCompactCurrency(accountSize);
            return sibling === undefined
                ? {
                      accountSize,
                      isModeled: false,
                      label: `${sizeLabel} (not modeled)`,
                      planSerial: null,
                  }
                : {
                      accountSize,
                      isModeled: true,
                      label: sizeLabel,
                      planSerial: serializePlanId(sibling.id),
                  };
        });
}

export function accountStageLabel(stage: AccountStage): string {
    return STAGE_LABEL[stage];
}

export function accountStageOptions(plan: Plan): readonly AccountStageOption[] {
    return Object.values(AccountStage)
        .filter((stage) => validateStageForPlan(stage, plan) === null)
        .map((stage) => ({ label: accountStageLabel(stage), stage }));
}

export function initialPlanSelection(
    firmParameter: null | string | undefined,
    planParameter: null | string | undefined,
): AccountPlanSelection {
    const firm =
        ALL_FIRMS.find((candidate) => candidate.id === firmParameter) ??
        ALL_FIRMS[0];
    const plan =
        (planParameter === null || planParameter === undefined
            ? null
            : firm?.findPlanBySerial(planParameter)) ?? firm?.plans[0];
    if (firm === undefined || plan === undefined) {
        throw new Error('No prop firm plan is modeled');
    }
    return {
        accountSize: plan.id.accountSize,
        firmId: firm.id,
        optIns: NO_PLAN_OPT_INS,
        planSerial: serializePlanId(plan.id),
    };
}

export function isLiveStartBalanceShown(stage: AccountStage): boolean {
    return stage === AccountStage.Live;
}

export function parsePersonalRulesText(
    text: PersonalRulesText,
): ParsedPersonalRules {
    const issues = new Map<PersonalRuleKey, string>();
    const raw: Partial<Record<PersonalRuleKey, number>> = {};
    for (const field of PERSONAL_RULE_FIELDS) {
        const entry = field.isMoney
            ? parseMoneyText(text[field.key])
            : parseCountText(text[field.key]);
        if (entry.kind === EntryTextKind.Invalid) {
            issues.set(field.key, entry.message);
        }
        if (entry.kind === EntryTextKind.Valid) {
            raw[field.key] = 'cents' in entry ? entry.cents : entry.count;
        }
    }
    const result = personalRulesSchema.safeParse(raw);
    if (!result.success) {
        for (const issue of result.error.issues) {
            const key = PERSONAL_RULE_KEY_SCHEMA.safeParse(issue.path[0]);
            if (key.success && !issues.has(key.data)) {
                issues.set(key.data, issue.message);
            }
        }
    }
    return {
        issues,
        rules: result.success && issues.size === 0 ? result.data : {},
    };
}

export function personalPayoutOverrideNotice(
    plan: Plan,
    overrideCents: undefined | UsdCents,
): null | string {
    if (overrideCents === undefined) return null;
    const minimum =
        plan.payoutLadder?.minRequestAmount ?? plan.minPayoutRequest;
    const override = usdCentsToDollars(overrideCents);
    if (override < minimum) {
        return `The firm minimum ${formatCurrency(minimum, Number.isSafeInteger(minimum) ? 0 : CENTS_FRACTION_DIGITS)} is above your ${formatUsdCents(overrideCents)}, so every request uses the firm minimum instead.`;
    }
    return `Your payout request of ${formatUsdCents(overrideCents)} replaces the rulebook size for this account. It is not a tighter cap: a different payout size changes both survival and income, so check it against the payout-size results before you rely on it.`;
}

export function personalRulesToText(rules: PersonalRules): PersonalRulesText {
    return {
        dailyLossLimitCents: optionalMoneyText(rules.dailyLossLimitCents),
        dailyProfitCapCents: optionalMoneyText(rules.dailyProfitCapCents),
        maxRiskPerTradeCents: optionalMoneyText(rules.maxRiskPerTradeCents),
        maxTradesPerDay:
            rules.maxTradesPerDay === undefined
                ? ''
                : String(rules.maxTradesPerDay),
        payoutRequestOverrideCents: optionalMoneyText(
            rules.payoutRequestOverrideCents,
        ),
        retainedCushionCents: optionalMoneyText(rules.retainedCushionCents),
    };
}

export function planTagLabel(tag: AccountPlanTag): string {
    return PLAN_TAG_LABEL[tag];
}

function optionalMoneyText(cents: undefined | UsdCents): string {
    return cents === undefined ? '' : usdCentsToText(cents);
}

function planTags(plan: Plan): readonly AccountPlanTag[] {
    const tags: AccountPlanTag[] = [];
    if (plan.availability === PlanAvailability.CallUpOnly) {
        tags.push(AccountPlanTag.CallUpOnly);
    }
    if (plan.isInstantFunded) tags.push(AccountPlanTag.InstantFunded);
    return tags;
}

function variantKey(plan: Plan): string {
    return 'variant' in plan.id ? plan.id.variant : '';
}
