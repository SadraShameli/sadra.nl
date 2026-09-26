import { describe, expect, it } from 'vitest';

import {
    CalculatorActionType,
    calculatorReducer,
    defaultCalculatorState,
} from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    decodeState,
    encodeState,
} from '~/app/(app)/prop-calculator/_components/urlState';
import { initialPlanSelection } from '~/app/(app)/prop-calculator/accounts/_components/accountPlanOptions';
import {
    type AccountPrefill,
    accountPrefillHref,
    type AccountPrefillParameters,
    accountPrefillQuery,
    EMPTY_ACCOUNT_PREFILL,
    parseAccountPrefill,
} from '~/app/(app)/prop-calculator/accounts/_components/accountPrefill';
import { planKeySchema } from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    NO_PLAN_OPT_INS,
    type Plan,
    type PlanOptIns,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';
import { CalculatorUrlParameter, UrlFlag } from '~/lib/schemas/url';
import { routes } from '~/lib/site/routes';

interface FirmPlan {
    readonly firm: TradingFirm;
    readonly plan: Plan;
}

const BOTH_OPT_INS: PlanOptIns = {
    takesFundedReset: true,
    takesOneTimeEarlyWithdrawal: true,
};

function findFirmPlan(isWanted: (plan: Plan) => boolean): FirmPlan {
    for (const firm of ALL_FIRMS) {
        const plan = firm.plans.find(isWanted);
        if (plan !== undefined) return { firm, plan };
    }
    throw new Error('no modeled plan matches');
}

function hrefParameters(href: string): AccountPrefillParameters {
    const url = new URL(href, 'https://x');
    return Object.fromEntries(url.searchParams);
}

function prefillOf(
    { firm, plan }: FirmPlan,
    optIns: PlanOptIns = NO_PLAN_OPT_INS,
): AccountPrefill {
    return {
        firmId: firm.id,
        optIns,
        planSerial: serializePlanId(plan.id),
    };
}

const withFundedReset = findFirmPlan((plan) => plan.fundedReset !== null);
const withEarlyWithdrawal = findFirmPlan(
    (plan) => plan.oneTimeEarlyWithdrawal !== null,
);
const withoutOptIns = findFirmPlan(
    (plan) => plan.fundedReset === null && plan.oneTimeEarlyWithdrawal === null,
);

describe('parseAccountPrefill', () => {
    it('reads the firm, the plan serial and the offered opt-ins', () => {
        const serial = serializePlanId(withFundedReset.plan.id);
        expect(
            parseAccountPrefill({
                [CalculatorUrlParameter.Firm]: withFundedReset.firm.id,
                [CalculatorUrlParameter.FundedReset]: '1',
                [CalculatorUrlParameter.Plan]: serial,
            }),
        ).toEqual({
            firmId: withFundedReset.firm.id,
            optIns: {
                takesFundedReset: true,
                takesOneTimeEarlyWithdrawal: false,
            },
            planSerial: serial,
        });
    });

    it('returns only values that parse through planKeySchema', () => {
        const prefill = parseAccountPrefill({
            [CalculatorUrlParameter.EarlyWithdrawal]: '1',
            [CalculatorUrlParameter.Firm]: withEarlyWithdrawal.firm.id,
            [CalculatorUrlParameter.Plan]: serializePlanId(
                withEarlyWithdrawal.plan.id,
            ),
        });
        expect(
            planKeySchema.safeParse({
                accountSize: withEarlyWithdrawal.plan.id.accountSize,
                firmId: prefill.firmId,
                optIns: prefill.optIns,
                planSerial: prefill.planSerial,
            }).success,
        ).toBe(true);
        expect(prefill.optIns.takesOneTimeEarlyWithdrawal).toBe(true);
    });

    it('is empty without any parameters', () => {
        expect(parseAccountPrefill({})).toEqual(EMPTY_ACCOUNT_PREFILL);
        expect(EMPTY_ACCOUNT_PREFILL).toEqual({
            firmId: null,
            optIns: NO_PLAN_OPT_INS,
            planSerial: null,
        });
    });

    it('drops an unknown firm together with its plan and opt-ins', () => {
        expect(
            parseAccountPrefill({
                [CalculatorUrlParameter.Firm]: 'not-a-firm',
                [CalculatorUrlParameter.FundedReset]: '1',
                [CalculatorUrlParameter.Plan]: serializePlanId(
                    withFundedReset.plan.id,
                ),
            }),
        ).toEqual(EMPTY_ACCOUNT_PREFILL);
    });

    it('drops a plan without a firm', () => {
        expect(
            parseAccountPrefill({
                [CalculatorUrlParameter.Plan]: serializePlanId(
                    withFundedReset.plan.id,
                ),
            }),
        ).toEqual(EMPTY_ACCOUNT_PREFILL);
    });

    it('keeps the firm and drops a plan serial that is not a plan of that firm', () => {
        const otherFirm = ALL_FIRMS.find(
            (firm) => firm.id !== withFundedReset.firm.id,
        );
        if (otherFirm === undefined) throw new Error('one firm modeled');
        for (const plan of [
            'nope',
            '',
            'x'.repeat(200),
            serializePlanId(withFundedReset.plan.id),
        ]) {
            expect(
                parseAccountPrefill({
                    [CalculatorUrlParameter.Firm]: otherFirm.id,
                    [CalculatorUrlParameter.FundedReset]: '1',
                    [CalculatorUrlParameter.Plan]: plan,
                }),
            ).toEqual({
                firmId: otherFirm.id,
                optIns: NO_PLAN_OPT_INS,
                planSerial: null,
            });
        }
    });

    it('drops an opt-in the plan does not offer and keeps the plan', () => {
        expect(
            parseAccountPrefill({
                [CalculatorUrlParameter.EarlyWithdrawal]: '1',
                [CalculatorUrlParameter.Firm]: withoutOptIns.firm.id,
                [CalculatorUrlParameter.FundedReset]: '1',
                [CalculatorUrlParameter.Plan]: serializePlanId(
                    withoutOptIns.plan.id,
                ),
            }),
        ).toEqual(prefillOf(withoutOptIns));
    });

    it('drops only the unoffered opt-in when the plan offers the other one', () => {
        const offersResetOnly = findFirmPlan(
            (plan) =>
                plan.fundedReset !== null &&
                plan.oneTimeEarlyWithdrawal === null,
        );
        expect(
            parseAccountPrefill({
                [CalculatorUrlParameter.EarlyWithdrawal]: '1',
                [CalculatorUrlParameter.Firm]: offersResetOnly.firm.id,
                [CalculatorUrlParameter.FundedReset]: '1',
                [CalculatorUrlParameter.Plan]: serializePlanId(
                    offersResetOnly.plan.id,
                ),
            }),
        ).toEqual(
            prefillOf(offersResetOnly, {
                takesFundedReset: true,
                takesOneTimeEarlyWithdrawal: false,
            }),
        );
    });

    it.each(['true', 'yes', '2', '', ' 1'])(
        'reads the opt-in flag %j as not taken',
        (flag) => {
            expect(
                parseAccountPrefill({
                    [CalculatorUrlParameter.Firm]: withFundedReset.firm.id,
                    [CalculatorUrlParameter.FundedReset]: flag,
                    [CalculatorUrlParameter.Plan]: serializePlanId(
                        withFundedReset.plan.id,
                    ),
                }).optIns,
            ).toEqual(NO_PLAN_OPT_INS);
        },
    );

    it('takes the first value of a repeated parameter', () => {
        const serial = serializePlanId(withFundedReset.plan.id);
        expect(
            parseAccountPrefill({
                [CalculatorUrlParameter.Firm]: [
                    withFundedReset.firm.id,
                    'not-a-firm',
                ],
                [CalculatorUrlParameter.FundedReset]: ['1', '0'],
                [CalculatorUrlParameter.Plan]: [serial, 'nope'],
            }),
        ).toEqual(
            prefillOf(withFundedReset, {
                takesFundedReset: true,
                takesOneTimeEarlyWithdrawal: false,
            }),
        );
    });

    it('ignores unrelated parameters', () => {
        expect(
            parseAccountPrefill({
                [CalculatorUrlParameter.Firm]: withoutOptIns.firm.id,
                [CalculatorUrlParameter.Plan]: serializePlanId(
                    withoutOptIns.plan.id,
                ),
                callbackUrl: '//evil.example',
                wr: '0.4',
            }),
        ).toEqual(prefillOf(withoutOptIns));
    });
});

describe('accountPrefillQuery', () => {
    it('writes the firm, the plan and only the taken opt-ins', () => {
        const query = new URLSearchParams(
            accountPrefillQuery(
                prefillOf(withFundedReset, {
                    takesFundedReset: true,
                    takesOneTimeEarlyWithdrawal: false,
                }),
            ),
        );
        expect(Object.fromEntries(query)).toEqual({
            [CalculatorUrlParameter.Firm]: withFundedReset.firm.id,
            [CalculatorUrlParameter.FundedReset]: '1',
            [CalculatorUrlParameter.Plan]: serializePlanId(
                withFundedReset.plan.id,
            ),
        });
    });

    it('is empty for the empty prefill', () => {
        expect(accountPrefillQuery(EMPTY_ACCOUNT_PREFILL)).toBe('');
    });

    it('writes a firm without a plan', () => {
        expect(
            accountPrefillQuery({
                ...EMPTY_ACCOUNT_PREFILL,
                firmId: withFundedReset.firm.id,
            }),
        ).toBe(`firm=${withFundedReset.firm.id}`);
    });
});

describe('accountPrefillHref (save as account)', () => {
    it('points at the new account page with the firm, plan and taken opt-ins', () => {
        const href = accountPrefillHref(
            withFundedReset.firm.id,
            withFundedReset.plan,
            { takesFundedReset: true, takesOneTimeEarlyWithdrawal: false },
        );
        const url = new URL(href, 'https://x');
        expect(url.pathname).toBe(routes.propCalculator.accounts.new);
        expect(url.hash).toBe('');
        expect(parseAccountPrefill(hrefParameters(href))).toEqual(
            prefillOf(withFundedReset, {
                takesFundedReset: true,
                takesOneTimeEarlyWithdrawal: false,
            }),
        );
    });

    it('leaves out an opt-in the plan does not offer', () => {
        const href = accountPrefillHref(
            withoutOptIns.firm.id,
            withoutOptIns.plan,
            BOTH_OPT_INS,
        );
        const parameters = hrefParameters(href);
        expect(parameters[CalculatorUrlParameter.FundedReset]).toBeUndefined();
        expect(
            parameters[CalculatorUrlParameter.EarlyWithdrawal],
        ).toBeUndefined();
        expect(parseAccountPrefill(parameters)).toEqual(
            prefillOf(withoutOptIns),
        );
    });

    it('round-trips every modeled plan and its offered opt-ins without drift', () => {
        for (const firm of ALL_FIRMS) {
            for (const plan of firm.plans) {
                const optIns: PlanOptIns = {
                    takesFundedReset: plan.fundedReset !== null,
                    takesOneTimeEarlyWithdrawal:
                        plan.oneTimeEarlyWithdrawal !== null,
                };
                const href = accountPrefillHref(firm.id, plan, optIns);
                expect(parseAccountPrefill(hrefParameters(href))).toEqual(
                    prefillOf({ firm, plan }, optIns),
                );
            }
        }
    });

    it('carries a taken opt-in from the simulator state to the account form prefill', () => {
        const { firm, plan } = withFundedReset;
        const state = [
            { firm, type: CalculatorActionType.SetFirm } as const,
            { plan, type: CalculatorActionType.SetPlan } as const,
            {
                isTaken: true,
                type: CalculatorActionType.SetTakesFundedReset,
            } as const,
        ].reduce(calculatorReducer, defaultCalculatorState());
        expect(state.takesFundedReset).toBe(true);
        const calculatorQuery = encodeState(state);
        const prefill = parseAccountPrefill(
            hrefParameters(
                accountPrefillHref(state.firm.id, state.plan, {
                    takesFundedReset: state.takesFundedReset,
                    takesOneTimeEarlyWithdrawal:
                        state.takesOneTimeEarlyWithdrawal,
                }),
            ),
        );
        expect(prefill.firmId).toBe(calculatorQuery.get('firm'));
        expect(prefill.planSerial).toBe(calculatorQuery.get('plan'));
        expect(prefill.optIns).toEqual({
            takesFundedReset: true,
            takesOneTimeEarlyWithdrawal: state.takesOneTimeEarlyWithdrawal,
        });
        expect(
            initialPlanSelection(
                prefill.firmId,
                prefill.planSerial,
                prefill.optIns,
            ),
        ).toEqual({
            accountSize: plan.id.accountSize,
            firmId: firm.id,
            optIns: {
                takesFundedReset: true,
                takesOneTimeEarlyWithdrawal: false,
            },
            planSerial: serializePlanId(plan.id),
        });
    });

    it('reads the calculator URL with the same firm, plan and opt-in keys', () => {
        for (const { firm, plan } of [
            withFundedReset,
            withEarlyWithdrawal,
            withoutOptIns,
        ]) {
            const state = [
                { firm, type: CalculatorActionType.SetFirm } as const,
                { plan, type: CalculatorActionType.SetPlan } as const,
                {
                    isTaken: true,
                    type: CalculatorActionType.SetTakesFundedReset,
                } as const,
                {
                    isTaken: true,
                    type: CalculatorActionType.SetTakesOneTimeEarlyWithdrawal,
                } as const,
            ].reduce(calculatorReducer, defaultCalculatorState());
            const calculatorParameters = Object.fromEntries(encodeState(state));
            expect(parseAccountPrefill(calculatorParameters)).toEqual(
                prefillOf(
                    { firm, plan },
                    {
                        takesFundedReset: plan.fundedReset !== null,
                        takesOneTimeEarlyWithdrawal:
                            plan.oneTimeEarlyWithdrawal !== null,
                    },
                ),
            );
        }
    });
});

describe('shared calculator URL keys', () => {
    it.each([
        {
            action: CalculatorActionType.SetTakesFundedReset,
            key: CalculatorUrlParameter.FundedReset,
            other: CalculatorUrlParameter.EarlyWithdrawal,
            target: withFundedReset,
        },
        {
            action: CalculatorActionType.SetTakesOneTimeEarlyWithdrawal,
            key: CalculatorUrlParameter.EarlyWithdrawal,
            other: CalculatorUrlParameter.FundedReset,
            target: withEarlyWithdrawal,
        },
    ] as const)(
        'writes the calculator URL with the shared firm, plan and $key keys and flag',
        ({ action, key, other, target }) => {
            const { firm, plan } = target;
            const state = [
                { firm, type: CalculatorActionType.SetFirm } as const,
                { plan, type: CalculatorActionType.SetPlan } as const,
                { isTaken: true, type: action } as const,
            ].reduce(calculatorReducer, defaultCalculatorState());
            const query = encodeState(state);
            expect(query.get(CalculatorUrlParameter.Firm)).toBe(firm.id);
            expect(query.get(CalculatorUrlParameter.Plan)).toBe(
                serializePlanId(plan.id),
            );
            expect(query.get(key)).toBe(UrlFlag.On);
            expect(query.get(other)).toBe(UrlFlag.Off);
        },
    );

    it.each([withFundedReset, withEarlyWithdrawal])(
        'reads a prefill query back into the calculator with the same keys',
        (target) => {
            const { firm, plan } = target;
            const optIns: PlanOptIns = {
                takesFundedReset: plan.fundedReset !== null,
                takesOneTimeEarlyWithdrawal:
                    plan.oneTimeEarlyWithdrawal !== null,
            };
            const query = accountPrefillQuery(prefillOf(target, optIns));
            const decoded = decodeState(
                new URLSearchParams(query),
                ALL_FIRMS,
                defaultCalculatorState(),
            );
            expect(decoded.firm.id).toBe(firm.id);
            expect(serializePlanId(decoded.plan.id)).toBe(
                serializePlanId(plan.id),
            );
            expect({
                takesFundedReset: decoded.takesFundedReset,
                takesOneTimeEarlyWithdrawal:
                    decoded.takesOneTimeEarlyWithdrawal,
            }).toEqual(optIns);
        },
    );
});
