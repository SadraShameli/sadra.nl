import { describe, expect, it } from 'vitest';

import { dollars, fraction } from '~/lib/prop-calculator/core';
import {
    attemptsAffordable,
    bankrollAttempts,
    bankrollAttemptsAt,
    bankrollCohortRisk,
    bankrollNoPayout,
    bankrollNoPayoutAt,
    bankrollRisk,
    bankrollRiskFigures,
    cohortOutcome,
    EconomicsReason,
    LOSS_RISK_DRAWS,
    noPayoutProbability,
} from '~/lib/prop-calculator/economics';

const RUN = {
    attemptPaysProbability: 0.3,
    costPerAttempt: 150,
    netValues: [-150, -150, -150, 900, -150, 1400, -150, -150],
};

describe('bankrollAttempts', () => {
    it('is the whole attempts the bankroll affords, priced in cents', () => {
        expect(bankrollAttempts(RUN, dollars(1000))).toBe(6);
        expect(bankrollAttempts(RUN, dollars(1000))).toBe(
            attemptsAffordable(dollars(1000), dollars(150)).value,
        );
    });

    it('is zero when the bankroll affords no attempt, not null', () => {
        expect(bankrollAttempts(RUN, dollars(149.99))).toBe(0);
    });

    it('is null for a free attempt or a negative bankroll', () => {
        expect(bankrollAttempts({ ...RUN, costPerAttempt: 0 }, dollars(1000))).toBeNull();
        expect(bankrollAttempts(RUN, dollars(-1))).toBeNull();
    });
});

describe('bankrollNoPayout', () => {
    it('is (1 - P(attempt pays)) to the attempts, from the run', () => {
        expect(bankrollNoPayout(RUN, 6)).toBe(
            noPayoutProbability(fraction(0.3), 6).value,
        );
    });

    it('takes the payout rate as an override when one is given', () => {
        expect(bankrollNoPayout(RUN, 6, fraction(0.5))).toBe(
            noPayoutProbability(fraction(0.5), 6).value,
        );
    });

    it('is null for an invalid attempt count', () => {
        expect(bankrollNoPayout(RUN, -1)).toBeNull();
    });
});

describe('bankrollRisk', () => {
    it('prices the attempts, the batch loss and P(no payout) once, on the given seed', () => {
        const risk = bankrollRisk(RUN, dollars(1000), 11);
        expect(risk.attempts).toBe(6);
        expect(risk.lossProbability).toEqual(
            cohortOutcome(RUN.netValues, 6, LOSS_RISK_DRAWS, 11).value
                ?.lossProbability,
        );
        expect(risk.noPayoutProbability).toBe(
            noPayoutProbability(fraction(0.3), 6).value,
        );
    });

    it('uses the payout rate override for P(no payout) only', () => {
        const base = bankrollRisk(RUN, dollars(1000), 11);
        const overridden = bankrollRisk(RUN, dollars(1000), 11, fraction(0.9));
        expect(overridden.noPayoutProbability).toBe(
            noPayoutProbability(fraction(0.9), 6).value,
        );
        expect(overridden.lossProbability).toEqual(base.lossProbability);
    });

    it('has no batch loss and a certain no-payout when the bankroll affords no attempt', () => {
        expect(bankrollRisk(RUN, dollars(10), 11)).toStrictEqual({
            attempts: 0,
            lossProbability: null,
            noPayoutProbability: 1,
        });
    });

    it('has nothing when the attempt cost is not positive', () => {
        expect(
            bankrollRisk({ ...RUN, costPerAttempt: 0 }, dollars(1000), 11),
        ).toStrictEqual({
            attempts: null,
            lossProbability: null,
            noPayoutProbability: null,
        });
    });
});

describe('bankrollRiskFigures', () => {
    it('is the batch loss and P(no payout) at the attempts the bankroll affords', () => {
        const figures = bankrollRiskFigures(RUN, dollars(1000), 11);
        const risk = bankrollRisk(RUN, dollars(1000), 11);
        expect(figures).toStrictEqual({
            lossProbability: risk.lossProbability?.value ?? null,
            noPayoutProbability: risk.noPayoutProbability,
        });
        expect(figures.lossProbability).not.toBeNull();
    });

    it('has no figures when the bankroll affords no attempt', () => {
        expect(bankrollRiskFigures(RUN, dollars(10), 11)).toStrictEqual({
            lossProbability: null,
            noPayoutProbability: null,
        });
    });
});

describe('bankrollAttemptsAt (PT-63d)', () => {
    it('is the whole attempts a bankroll affords at a given cost, as bankrollAttempts prices them from a run', () => {
        expect(bankrollAttemptsAt(dollars(1000), dollars(150))).toBe(6);
        expect(bankrollAttemptsAt(dollars(1000), dollars(150))).toBe(
            bankrollAttempts(RUN, dollars(1000)),
        );
    });

    it('is zero below one attempt and null for a free attempt or a negative bankroll', () => {
        expect(bankrollAttemptsAt(dollars(149.99), dollars(150))).toBe(0);
        expect(bankrollAttemptsAt(dollars(1000), dollars(0))).toBeNull();
        expect(bankrollAttemptsAt(dollars(-1), dollars(150))).toBeNull();
    });
});

describe('bankrollNoPayoutAt (PT-63d)', () => {
    it('is (1 - P(attempt pays)) to the attempts, for a rate that does not come from a run', () => {
        expect(bankrollNoPayoutAt(fraction(0.3), 6)).toBe(
            noPayoutProbability(fraction(0.3), 6).value,
        );
        expect(bankrollNoPayoutAt(fraction(0.3), 6)).toBe(
            bankrollNoPayout(RUN, 6),
        );
    });

    it('is null for an invalid attempt count', () => {
        expect(bankrollNoPayoutAt(fraction(0.3), -1)).toBeNull();
    });
});

describe('bankrollCohortRisk (PT-63d)', () => {
    it('prices the batch loss and the mean net of exactly the attempts given, on the draws and seed given', () => {
        const outcome = cohortOutcome(RUN.netValues, 6, LOSS_RISK_DRAWS, 11);
        const risk = bankrollCohortRisk(RUN.netValues, 6, LOSS_RISK_DRAWS, 11);
        expect(risk.value).toStrictEqual({
            attempts: 6,
            lossProbability: outcome.value?.lossProbability,
            meanNet: outcome.value?.meanNet,
        });
        expect(risk.reason).toBeNull();
    });

    it('honours a smaller draw count and a different seed', () => {
        const outcome = cohortOutcome(RUN.netValues, 4, 500, 3).value;
        const risk = bankrollCohortRisk(RUN.netValues, 4, 500, 3).value;
        expect(risk?.lossProbability).toStrictEqual(outcome?.lossProbability);
        expect(risk?.meanNet).toBe(outcome?.meanNet);
    });

    it('is what bankrollRisk reports for the attempts the bankroll affords', () => {
        const risk = bankrollRisk(RUN, dollars(1000), 11);
        expect(
            bankrollCohortRisk(RUN.netValues, 6, LOSS_RISK_DRAWS, 11).value
                ?.lossProbability,
        ).toStrictEqual(risk.lossProbability);
    });

    it.each([0, -3, 0.5, NaN, Infinity])(
        'has nothing for %s attempts, because a batch needs at least one whole attempt, and says the input is invalid',
        (attempts) => {
            const risk = bankrollCohortRisk(
                RUN.netValues,
                attempts,
                LOSS_RISK_DRAWS,
                11,
            );
            expect(risk.value).toBeNull();
            expect(risk.reason).toBe(EconomicsReason.InvalidInput);
        },
    );

    it('has nothing without net values or with a non-finite one', () => {
        expect(
            bankrollCohortRisk([], 6, LOSS_RISK_DRAWS, 11).value,
        ).toBeNull();
        expect(
            bankrollCohortRisk([1, NaN], 6, LOSS_RISK_DRAWS, 11).reason,
        ).toBe(EconomicsReason.InvalidInput);
    });

    it('reads a frozen net value list and never copies or changes it', () => {
        const frozen = Object.freeze([...RUN.netValues]);
        const before = [...frozen];
        const risk = bankrollCohortRisk(frozen, 6, LOSS_RISK_DRAWS, 11);
        expect(risk.value).not.toBeNull();
        expect([...frozen]).toStrictEqual(before);
        expect(
            bankrollRisk({ ...RUN, netValues: frozen }, dollars(1000), 11)
                .lossProbability,
        ).toStrictEqual(risk.value?.lossProbability);
    });
});
