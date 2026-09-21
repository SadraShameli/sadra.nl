import { describe, expect, it } from 'vitest';

import {
    DailyLossLimitBreachEffect,
    DailyLossLimitKind,
    dollars,
    FirmId,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import {
    E8FuturesVariant,
    LucidVariant,
} from '~/lib/prop-calculator/core/PlanId';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';
import { E8Futures } from '~/lib/prop-calculator/firms/e8futures/E8Futures';
import { LucidTrading } from '~/lib/prop-calculator/firms/lucid/LucidTrading';

const lucidDirect = new LucidTrading().findPlan({
    accountSize: 50_000,
    firm: FirmId.Lucid,
    variant: LucidVariant.Direct,
});
if (!lucidDirect) throw new Error('LucidDirect 50K plan not found');

describe('Plan.withMaxLifetimePayouts', () => {
    it(
        'a synthetic 5-step payoutLadder with no capsAtLastStep -- confirms the ' +
            'real trap this method exists to close: clearing only ' +
            'maxLifetimePayouts is NOT enough to uncap the plan. LucidDirect used ' +
            'to be exactly this shape until capsAtLastStep: true was added to its ' +
            "own payoutLadder to match the firm's confirmed no-cap payout policy, " +
            'so this test now builds the trap directly instead of riding a live ' +
            'plan that could get fixed out from under it again',
        () => {
            const trapped = lucidDirect.withOverrides({
                maxLifetimePayouts: undefined,
                payoutLadder: lucidDirect.payoutLadder && {
                    ...lucidDirect.payoutLadder,
                    capsAtLastStep: undefined,
                },
            });
            expect(trapped.maxLifetimePayouts).toBeNull();
            expect(trapped.payoutLadder?.steps.length).toBe(5);
            expect(trapped.payoutLadder?.capsAtLastStep).toBeUndefined();

            const withCap = trapped.withOverrides({
                maxLifetimePayouts: 5,
            });
            expect(withCap.maxLifetimePayouts).toBe(5);

            const halfFixed = withCap.withOverrides({
                maxLifetimePayouts: undefined,
            });
            expect(halfFixed.maxLifetimePayouts).toBeNull();
            expect(halfFixed.isAccountConcluded(50)).toBe(true);
        },
    );

    it('withMaxLifetimePayouts(null) genuinely removes both caps at once', () => {
        const uncapped = lucidDirect.withMaxLifetimePayouts(null);
        expect(uncapped.maxLifetimePayouts).toBeNull();
        expect(uncapped.payoutLadder?.capsAtLastStep).toBe(true);
        expect(uncapped.isAccountConcluded(5)).toBe(false);
        expect(uncapped.isAccountConcluded(50)).toBe(false);
        expect(uncapped.isAccountConcluded(1000)).toBe(false);
    });

    it(
        'withMaxLifetimePayouts(N) caps at exactly N even when N exceeds the ' +
            "ladder's own step count, by also forcing capsAtLastStep so the " +
            'ladder repeats its last step instead of silently exhausting early',
        () => {
            const extended = lucidDirect.withMaxLifetimePayouts(8);
            expect(extended.maxLifetimePayouts).toBe(8);
            expect(extended.isAccountConcluded(7)).toBe(false);
            expect(extended.isAccountConcluded(8)).toBe(true);
            expect(extended.payoutLadder?.capsAtLastStep).toBe(true);
        },
    );

    it('withMaxLifetimePayouts(N) below the ladder length still concludes at N', () => {
        const shortened = lucidDirect.withMaxLifetimePayouts(2);
        expect(shortened.isAccountConcluded(1)).toBe(false);
        expect(shortened.isAccountConcluded(2)).toBe(true);
    });

    it('a plan with no payoutLadder at all is unaffected by the ladder-fix side effect', () => {
        const signature = new E8Futures().findPlan({
            accountSize: 50_000,
            firm: FirmId.E8Futures,
            variant: E8FuturesVariant.Signature,
        });
        if (!signature) throw new Error('E8 Signature 50K plan not found');
        expect(signature.payoutLadder).toBeNull();

        const uncapped = signature.withMaxLifetimePayouts(null);
        expect(uncapped.payoutLadder).toBeNull();
        expect(uncapped.maxLifetimePayouts).toBeNull();
        expect(uncapped.isAccountConcluded(9999)).toBe(false);
    });
});

describe('Plan constructor: minTradingDays invariant', () => {
    it('rejects a negative minTradingDays at construction', () => {
        expect(() => lucidDirect.withOverrides({ minTradingDays: -1 })).toThrow(
            /minTradingDays/,
        );
    });

    it(
        'rejects NaN and fractional minTradingDays values too, matching ' +
            'the error message\'s own "integer" promise',
        () => {
            expect(() =>
                lucidDirect.withOverrides({ minTradingDays: NaN }),
            ).toThrow(/minTradingDays/);
            expect(() =>
                lucidDirect.withOverrides({ minTradingDays: 2.5 }),
            ).toThrow(/minTradingDays/);
        },
    );

    it('accepts zero, the "no minimum trading days" sentinel', () => {
        expect(
            lucidDirect.withOverrides({ minTradingDays: 0 }).minTradingDays,
        ).toBe(0);
    });
});

describe('Plan.isBust: hard vs soft daily loss limit', () => {
    const softDll = lucidDirect.withOverrides({
        evalDailyLossLimit: {
            amount: dollars(1000),
            kind: DailyLossLimitKind.Flat,
        },
        evalDailyLossLimitBreach: undefined,
    });
    const hardDll = softDll.withOverrides({
        evalDailyLossLimitBreach: DailyLossLimitBreachEffect.Terminate,
    });
    const atLimit = () => ({ ...softDll.initialState(), todayPnL: -1000 });

    it(
        'a soft limit stops the day without killing the account, which is the ' +
            'behaviour every firm modeled before hard limits existed and the ' +
            'one FTMO Growth still relies on ("The account is not terminated")',
        () => {
            expect(softDll.isDayLockedOut(atLimit(), TradingPhase.Eval)).toBe(
                true,
            );
            expect(softDll.isBust(atLimit(), TradingPhase.Eval)).toBe(false);
        },
    );

    it(
        'a hard limit kills the account on the same state, because FTMO counts ' +
            'equity merely hitting the limit as a violation, not exceeding it',
        () => {
            expect(hardDll.isDayLockedOut(atLimit(), TradingPhase.Eval)).toBe(
                true,
            );
            expect(hardDll.isBust(atLimit(), TradingPhase.Eval)).toBe(true);
        },
    );

    it('one dollar short of a hard limit is neither locked out nor bust', () => {
        const oneShort = { ...hardDll.initialState(), todayPnL: -999 };
        expect(hardDll.isDayLockedOut(oneShort, TradingPhase.Eval)).toBe(false);
        expect(hardDll.isBust(oneShort, TradingPhase.Eval)).toBe(false);
    });

    it(
        'the drawdown breach still busts on its own, so the added daily-loss ' +
            'clause composes with the drawdown check instead of replacing it',
        () => {
            const drawdownBreached = {
                ...softDll.initialState(),
                balance: softDll.initialState().threshold,
            };
            expect(softDll.isBust(drawdownBreached, TradingPhase.Eval)).toBe(
                true,
            );
            expect(
                softDll.isDayLockedOut(drawdownBreached, TradingPhase.Eval),
            ).toBe(false);
        },
    );

    it('the funded phase inherits the eval breach effect unless it sets its own, mirroring the existing fundedDailyLossLimit fallback', () => {
        expect(hardDll.isDailyLossLimitTerminating(TradingPhase.Funded)).toBe(
            true,
        );
        const softFunded = hardDll.withOverrides({
            fundedDailyLossLimitBreach: DailyLossLimitBreachEffect.Lockout,
        });
        expect(softFunded.isDailyLossLimitTerminating(TradingPhase.Eval)).toBe(
            true,
        );
        expect(
            softFunded.isDailyLossLimitTerminating(TradingPhase.Funded),
        ).toBe(false);
    });

    it('rejects a Terminate breach declared against a limit of None, since there is nothing to breach', () => {
        expect(() =>
            lucidDirect.withOverrides({
                evalDailyLossLimit: { kind: DailyLossLimitKind.None },
                evalDailyLossLimitBreach: DailyLossLimitBreachEffect.Terminate,
                fundedDailyLossLimitBreach: DailyLossLimitBreachEffect.Lockout,
            }),
        ).toThrow(/nothing to breach/);
    });

    it(
        'every plan of every registered firm keeps the Lockout default except ' +
            'FTMO Pro, which is the guard that the new field changed nobody ' +
            "else's modeled behaviour",
        () => {
            const terminating = ALL_FIRMS.flatMap((firm) =>
                firm.plans
                    .filter(
                        (plan) =>
                            plan.isDailyLossLimitTerminating(
                                TradingPhase.Eval,
                            ) ||
                            plan.isDailyLossLimitTerminating(
                                TradingPhase.Funded,
                            ),
                    )
                    .map((plan) => serializePlanId(plan.id)),
            );
            expect(terminating).toStrictEqual(['ftmo-futures-50000-pro']);
        },
    );
});
