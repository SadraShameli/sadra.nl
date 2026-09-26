import { describe, expect, it } from 'vitest';

import {
    accountFirmOptions,
    accountOptInOptions,
    accountPlanOptions,
    AccountPlanTag,
    accountSizeOptions,
    accountStageLabel,
    accountStageOptions,
    DISPLAYED_ACCOUNT_SIZES,
    EMPTY_PERSONAL_RULES_TEXT,
    initialPlanSelection,
    isLiveStartBalanceShown,
    parsePersonalRulesText,
    PERSONAL_RULE_FIELDS,
    personalPayoutOverrideNotice,
    personalRulesToText,
    planTagLabel,
    usdCentsToText,
} from '~/app/(app)/prop-calculator/accounts/_components/accountPlanOptions';
import {
    AccountStage,
    compareText,
    describePlanOptIn,
    MAX_PERSONAL_TRADES_PER_DAY,
    offeredPlanOptIns,
    personalRulesSchema,
    PlanOptIn,
    usdCents,
    validateStageForPlan,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    FirmId,
    NO_PLAN_OPT_INS,
    type Plan,
    PlanAvailability,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';

interface FirmPlan {
    readonly firm: TradingFirm;
    readonly plan: Plan;
}

const ALL_FIRM_PLANS: readonly FirmPlan[] = ALL_FIRMS.flatMap((firm) =>
    firm.plans.map((plan) => ({ firm, plan })),
);

function findFirmPlan(isMatch: (plan: Plan) => boolean): FirmPlan {
    const found = ALL_FIRM_PLANS.find(({ plan }) => isMatch(plan));
    if (found === undefined) throw new Error('no plan matches the predicate');
    return found;
}

function variantOf(plan: Plan): string {
    return 'variant' in plan.id ? plan.id.variant : '';
}

describe('accountFirmOptions', () => {
    it('offers every modeled firm once with its display name', () => {
        const options = accountFirmOptions();
        expect(options.map((option) => option.firmId)).toEqual(
            ALL_FIRMS.map((firm) => firm.id),
        );
        for (const [index, option] of options.entries()) {
            expect(option.label).toBe(ALL_FIRMS[index]?.displayName);
        }
    });
});

describe('accountPlanOptions', () => {
    it('offers every plan of the firm, keyed by its serial', () => {
        for (const firm of ALL_FIRMS) {
            const options = accountPlanOptions(firm);
            expect(options.map((option) => option.planSerial)).toEqual(
                firm.plans.map((plan) => serializePlanId(plan.id)),
            );
            expect(options.map((option) => option.label)).toEqual(
                firm.plans.map((plan) => plan.label),
            );
        }
    });

    it('tags instant-funded plans', () => {
        const { firm, plan } = findFirmPlan((p) => p.isInstantFunded);
        const option = accountPlanOptions(firm).find(
            (o) => o.planSerial === serializePlanId(plan.id),
        );
        expect(option?.tags).toContain(AccountPlanTag.InstantFunded);
    });

    it('tags call-up-only plans', () => {
        const { firm, plan } = findFirmPlan(
            (p) => p.availability === PlanAvailability.CallUpOnly,
        );
        const option = accountPlanOptions(firm).find(
            (o) => o.planSerial === serializePlanId(plan.id),
        );
        expect(option?.tags).toContain(AccountPlanTag.CallUpOnly);
    });

    it('tags a plan exactly by its own flags', () => {
        for (const { firm, plan } of ALL_FIRM_PLANS) {
            const option = accountPlanOptions(firm).find(
                (o) => o.planSerial === serializePlanId(plan.id),
            );
            expect(option?.tags.includes(AccountPlanTag.InstantFunded)).toBe(
                plan.isInstantFunded,
            );
            expect(option?.tags.includes(AccountPlanTag.CallUpOnly)).toBe(
                plan.availability === PlanAvailability.CallUpOnly,
            );
        }
    });

    it('labels every tag', () => {
        expect(planTagLabel(AccountPlanTag.CallUpOnly)).toBe('call-up only');
        expect(planTagLabel(AccountPlanTag.InstantFunded)).toBe(
            'instant funded',
        );
    });
});

describe('accountOptInOptions', () => {
    it('offers exactly the opt-ins the plan offers, labelled by describePlanOptIn', () => {
        for (const { plan } of ALL_FIRM_PLANS) {
            const options = accountOptInOptions(plan);
            expect(options.map((option) => option.optIn)).toEqual(
                offeredPlanOptIns(plan),
            );
            for (const option of options) {
                expect(option.label).toBe(describePlanOptIn(option.optIn));
            }
        }
    });

    it('maps each opt-in to its PlanOptIns field', () => {
        const withReset = findFirmPlan((p) => p.fundedReset !== null).plan;
        expect(
            accountOptInOptions(withReset).find(
                (option) => option.optIn === PlanOptIn.FundedReset,
            )?.field,
        ).toBe('takesFundedReset');
        const withEarly = findFirmPlan(
            (p) => p.oneTimeEarlyWithdrawal !== null,
        ).plan;
        expect(
            accountOptInOptions(withEarly).find(
                (option) => option.optIn === PlanOptIn.OneTimeEarlyWithdrawal,
            )?.field,
        ).toBe('takesOneTimeEarlyWithdrawal');
    });

    it('offers nothing on a plan without opt-ins', () => {
        const plain = findFirmPlan(
            (p) => p.fundedReset === null && p.oneTimeEarlyWithdrawal === null,
        ).plan;
        expect(accountOptInOptions(plain)).toEqual([]);
    });
});

describe('accountSizeOptions', () => {
    it('enables the modeled size of the plan and links it to the plan serial', () => {
        for (const { firm, plan } of ALL_FIRM_PLANS) {
            const own = accountSizeOptions(firm, plan).find(
                (option) => option.accountSize === plan.id.accountSize,
            );
            expect(own?.isModeled).toBe(true);
            expect(own?.planSerial).toBe(serializePlanId(plan.id));
        }
    });

    it('only links a size to a plan of the same firm and variant', () => {
        for (const { firm, plan } of ALL_FIRM_PLANS) {
            for (const option of accountSizeOptions(firm, plan)) {
                if (option.planSerial === null) continue;
                const sibling = firm.findPlanBySerial(option.planSerial);
                expect(sibling).not.toBeNull();
                if (sibling === null) continue;
                expect(variantOf(sibling)).toBe(variantOf(plan));
                expect(sibling.id.accountSize).toBe(option.accountSize);
            }
        }
    });

    it('shows sizes the engine does not model as disabled "not modeled"', () => {
        const { firm, plan } = ALL_FIRM_PLANS[0] ?? findFirmPlan(() => true);
        const options = accountSizeOptions(firm, plan);
        const unmodeled = options.filter((option) => !option.isModeled);
        expect(unmodeled.length).toBeGreaterThan(0);
        for (const option of unmodeled) {
            expect(option.planSerial).toBeNull();
            expect(option.label).toContain('not modeled');
            expect(
                firm.plans.some(
                    (p) =>
                        p.id.accountSize === option.accountSize &&
                        variantOf(p) === variantOf(plan),
                ),
            ).toBe(false);
        }
    });

    it('lists each size once, ascending, including every displayed size', () => {
        for (const { firm, plan } of ALL_FIRM_PLANS) {
            const sizes = accountSizeOptions(firm, plan).map(
                (option) => option.accountSize,
            );
            expect(sizes).toEqual(
                [...new Set(sizes)].toSorted((a, b) => a - b),
            );
            for (const size of DISPLAYED_ACCOUNT_SIZES) {
                expect(sizes).toContain(size);
            }
        }
    });
});

describe('accountStageOptions', () => {
    it('excludes Eval on an instant-funded plan', () => {
        const { plan } = findFirmPlan((p) => p.isInstantFunded);
        expect(accountStageOptions(plan).map((option) => option.stage)).toEqual(
            [AccountStage.Funded, AccountStage.Live],
        );
    });

    it('offers every stage on a plan with an evaluation', () => {
        const { plan } = findFirmPlan((p) => !p.isInstantFunded);
        expect(accountStageOptions(plan).map((option) => option.stage)).toEqual(
            [AccountStage.Eval, AccountStage.Funded, AccountStage.Live],
        );
    });

    it('offers exactly the stages the router accepts for every plan', () => {
        for (const { plan } of ALL_FIRM_PLANS) {
            const offered = new Set(
                accountStageOptions(plan).map((option) => option.stage),
            );
            for (const stage of Object.values(AccountStage)) {
                expect(offered.has(stage)).toBe(
                    validateStageForPlan(stage, plan) === null,
                );
            }
        }
    });

    it('labels every offered stage', () => {
        const { plan } = findFirmPlan((p) => !p.isInstantFunded);
        expect(accountStageOptions(plan).map((option) => option.label)).toEqual(
            ['Evaluation', 'Funded', 'Live'],
        );
    });
});

describe('accountStageLabel', () => {
    it('labels every stage', () => {
        expect(
            Object.values(AccountStage).map((stage) =>
                accountStageLabel(stage),
            ),
        ).toEqual(['Evaluation', 'Funded', 'Live']);
    });
});

describe('initialPlanSelection', () => {
    const [firstFirm] = ALL_FIRMS;
    const [firstPlan] = firstFirm?.plans ?? [];

    it('defaults to the first plan of the first firm', () => {
        expect(firstFirm).toBeDefined();
        expect(firstPlan).toBeDefined();
        if (firstFirm === undefined || firstPlan === undefined) return;
        const expected = {
            accountSize: firstPlan.id.accountSize,
            firmId: firstFirm.id,
            optIns: NO_PLAN_OPT_INS,
            planSerial: serializePlanId(firstPlan.id),
        };
        expect(initialPlanSelection(undefined, undefined)).toEqual(expected);
        expect(initialPlanSelection(null, null)).toEqual(expected);
        expect(initialPlanSelection('not-a-firm', 'x')).toEqual(expected);
    });

    it('takes the first plan of a known firm without a plan', () => {
        const topStep = ALL_FIRMS.find((firm) => firm.id === FirmId.TopStep);
        const [plan] = topStep?.plans ?? [];
        if (plan === undefined) throw new Error('TopStep has no plan');
        expect(initialPlanSelection(FirmId.TopStep, undefined)).toEqual({
            accountSize: plan.id.accountSize,
            firmId: FirmId.TopStep,
            optIns: NO_PLAN_OPT_INS,
            planSerial: serializePlanId(plan.id),
        });
    });

    it('takes a plan that belongs to the firm', () => {
        for (const { firm, plan } of ALL_FIRM_PLANS) {
            expect(
                initialPlanSelection(firm.id, serializePlanId(plan.id)),
            ).toEqual({
                accountSize: plan.id.accountSize,
                firmId: firm.id,
                optIns: NO_PLAN_OPT_INS,
                planSerial: serializePlanId(plan.id),
            });
        }
    });

    it('ignores a plan of another firm or an unknown plan', () => {
        const apex = ALL_FIRMS.find((firm) => firm.id === FirmId.Apex);
        const topStep = ALL_FIRMS.find((firm) => firm.id === FirmId.TopStep);
        const [apexPlan] = apex?.plans ?? [];
        const [topStepPlan] = topStep?.plans ?? [];
        if (apexPlan === undefined || topStepPlan === undefined) {
            throw new Error('missing plans');
        }
        expect(
            initialPlanSelection(FirmId.Apex, serializePlanId(topStepPlan.id))
                .planSerial,
        ).toBe(serializePlanId(apexPlan.id));
        expect(
            initialPlanSelection(FirmId.Apex, 'apex-50000-retired').planSerial,
        ).toBe(serializePlanId(apexPlan.id));
    });
});

describe('isLiveStartBalanceShown', () => {
    it('shows the live start balance for stage Live only', () => {
        expect(isLiveStartBalanceShown(AccountStage.Live)).toBe(true);
        expect(isLiveStartBalanceShown(AccountStage.Funded)).toBe(false);
        expect(isLiveStartBalanceShown(AccountStage.Eval)).toBe(false);
    });
});

describe('personalPayoutOverrideNotice', () => {
    const { plan } = findFirmPlan(
        (p) => (p.payoutLadder?.minRequestAmount ?? p.minPayoutRequest) > 1,
    );
    const minimum =
        plan.payoutLadder?.minRequestAmount ?? plan.minPayoutRequest;

    it('says nothing without an override', () => {
        expect(personalPayoutOverrideNotice(plan, undefined)).toBeNull();
    });

    it('names the firm minimum when the override is below it', () => {
        const notice = personalPayoutOverrideNotice(plan, usdCents(12_345));
        expect(notice).toContain(
            `firm minimum $${minimum.toLocaleString('en-US')} is above your $123.45`,
        );
    });

    it('warns that the override is not a tighter cap when it is at or above the minimum', () => {
        const atMinimum = usdCents(Math.round(minimum * 100));
        const notice = personalPayoutOverrideNotice(plan, atMinimum);
        expect(notice).not.toBeNull();
        expect(notice).not.toContain('firm minimum');
        expect(notice).toContain('not a tighter cap');
    });
});

describe('PERSONAL_RULE_FIELDS', () => {
    it('has one field for every personal rule the schema stores', () => {
        expect(
            PERSONAL_RULE_FIELDS.map((field) => field.key).toSorted(
                compareText,
            ),
        ).toEqual(personalRulesSchema.keyof().options.toSorted(compareText));
        expect(
            Object.keys(EMPTY_PERSONAL_RULES_TEXT).toSorted(compareText),
        ).toEqual(personalRulesSchema.keyof().options.toSorted(compareText));
    });

    it('marks every cent amount as money and the trade count as a count', () => {
        expect(
            PERSONAL_RULE_FIELDS.filter((field) => !field.isMoney).map(
                (field) => field.key,
            ),
        ).toEqual(['maxTradesPerDay']);
    });
});

describe('parsePersonalRulesText', () => {
    it('reads an all-empty form as no personal rules', () => {
        const parsed = parsePersonalRulesText(EMPTY_PERSONAL_RULES_TEXT);
        expect(parsed.issues.size).toBe(0);
        expect(parsed.rules).toEqual({});
    });

    it('reads dollars into cents and the trade count as a whole number', () => {
        const parsed = parsePersonalRulesText({
            ...EMPTY_PERSONAL_RULES_TEXT,
            maxRiskPerTradeCents: '$450.50',
            maxTradesPerDay: '3',
            payoutRequestOverrideCents: '1,000',
        });
        expect(parsed.issues.size).toBe(0);
        expect(parsed.rules).toEqual({
            maxRiskPerTradeCents: 45_050,
            maxTradesPerDay: 3,
            payoutRequestOverrideCents: 100_000,
        });
    });

    it('puts every unreadable or out-of-range value on its own field', () => {
        const parsed = parsePersonalRulesText({
            ...EMPTY_PERSONAL_RULES_TEXT,
            dailyLossLimitCents: 'abc',
            maxRiskPerTradeCents: '0',
            maxTradesPerDay: String(MAX_PERSONAL_TRADES_PER_DAY + 1),
            retainedCushionCents: '-5',
        });
        expect(parsed.issues.keys().toArray().toSorted(compareText)).toEqual(
            [
                'dailyLossLimitCents',
                'maxRiskPerTradeCents',
                'maxTradesPerDay',
                'retainedCushionCents',
            ].toSorted(compareText),
        );
        expect(parsed.rules).toEqual({});
    });
});

describe('personalRulesToText', () => {
    it('writes stored rules back as form text that parses to the same rules', () => {
        const rules = {
            dailyProfitCapCents: usdCents(80_000),
            maxRiskPerTradeCents: usdCents(45_050),
            maxTradesPerDay: 3,
        };
        const text = personalRulesToText(rules);
        expect(text).toEqual({
            ...EMPTY_PERSONAL_RULES_TEXT,
            dailyProfitCapCents: '800',
            maxRiskPerTradeCents: '450.50',
            maxTradesPerDay: '3',
        });
        expect(parsePersonalRulesText(text).rules).toEqual(rules);
    });
});

describe('usdCentsToText', () => {
    it('writes whole dollars without decimals and cents with two digits', () => {
        expect(usdCentsToText(usdCents(5_000_000))).toBe('50000');
        expect(usdCentsToText(usdCents(5))).toBe('0.05');
        expect(usdCentsToText(usdCents(-125_050))).toBe('-1250.50');
        expect(usdCentsToText(usdCents(0))).toBe('0');
    });
});
