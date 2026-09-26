import { describe, expect, it } from 'vitest';

import {
    ApexVariant,
    dollars,
    FirmId,
    type Plan,
    rebuyFee,
    resetFee,
    retryFee,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import * as economics from '~/lib/prop-calculator/economics';
import {
    bustCost,
    EconomicsDisclosure,
    EconomicsReason,
    feeEquivalentTradeRisk,
} from '~/lib/prop-calculator/economics';
import { ALL_FIRMS, findFirm } from '~/lib/prop-calculator/firms';

function cheaperResetPlan(): Plan {
    const plan = ALL_FIRMS.flatMap((firm) => firm.plans).find(
        (candidate) => resetFee(candidate.fees) < rebuyFee(candidate.fees),
    );
    if (!plan) throw new Error('no plan with a reset cheaper than a rebuy');
    return plan;
}

const videoFeeEquivalent = {
    evalDrawdown: dollars(4500),
    retryFee: dollars(250),
} as const;

describe('bustCost (VD-10)', () => {
    it('equals the retry fee exactly at the fresh state', () => {
        const result = bustCost({
            phase: TradingPhase.Eval,
            retryFee: dollars(250),
            valueFreshEval: dollars(420),
            valueNow: dollars(420),
        });
        expect(result.value).toBe(250);
    });

    it('exceeds the retry fee when the account is worth more than a fresh eval', () => {
        const result = bustCost({
            phase: TradingPhase.Eval,
            retryFee: dollars(250),
            valueFreshEval: dollars(420),
            valueNow: dollars(1170),
        });
        expect(result.value).toBeCloseTo(1000, 9);
        expect(result.value ?? 0).toBeGreaterThan(250);
    });

    it('prices a sunk-fee account at one retry fee, never the fees already paid', () => {
        const feesAlreadyPaid = [250, 250, 250];
        const result = bustCost({
            phase: TradingPhase.Eval,
            retryFee: dollars(250),
            valueFreshEval: dollars(300),
            valueNow: dollars(300),
        });
        expect(result.value).toBe(250);
        expect(result.value).not.toBe(
            feesAlreadyPaid.reduce((sum, fee) => sum + fee, 0),
        );
    });

    it('returns the rebuy lag as a disclosure', () => {
        expect(
            bustCost({
                phase: TradingPhase.Eval,
                retryFee: dollars(250),
                valueFreshEval: dollars(0),
                valueNow: dollars(0),
            }).disclosures,
        ).toContain(EconomicsDisclosure.RebuyLagNotPriced);
    });

    it('prices a funded bust at the rebuy fee, since a funded account cannot be reset back to a fresh eval', () => {
        const plan = cheaperResetPlan();
        const rebuy = rebuyFee(plan.fees);
        expect(resetFee(plan.fees)).toBeLessThan(rebuy);
        const funded = bustCost({
            phase: TradingPhase.Funded,
            rebuyFee: dollars(rebuy),
            valueFreshEval: dollars(300),
            valueNow: dollars(1300),
        });
        expect(funded.value).toBeCloseTo(1000 + rebuy, 9);
        const evalBust = bustCost({
            phase: TradingPhase.Eval,
            retryFee: dollars(retryFee(plan.fees)),
            valueFreshEval: dollars(300),
            valueNow: dollars(300),
        });
        expect(evalBust.value).toBeCloseTo(resetFee(plan.fees), 9);
        expect(evalBust.value ?? 0).toBeLessThan(funded.value ?? 0);
    });

    it('refuses a negative retry fee', () => {
        expect(
            bustCost({
                phase: TradingPhase.Eval,
                retryFee: dollars(-1),
                valueFreshEval: dollars(0),
                valueNow: dollars(0),
            }).reason,
        ).toBe(EconomicsReason.InvalidInput);
    });
});

describe('feeEquivalentTradeRisk (eval-only heuristic)', () => {
    it('maps a full-drawdown risk to the whole retry fee', () => {
        expect(
            feeEquivalentTradeRisk({
                ...videoFeeEquivalent,
                risk: dollars(4500),
            }).value,
        ).toBeCloseTo(250, 9);
    });

    it('maps half the drawdown to half the retry fee', () => {
        expect(
            feeEquivalentTradeRisk({
                ...videoFeeEquivalent,
                risk: dollars(2250),
            }).value,
        ).toBeCloseTo(125, 9);
    });

    it('caps a risk above the drawdown at the retry fee', () => {
        expect(
            feeEquivalentTradeRisk({
                ...videoFeeEquivalent,
                risk: dollars(9000),
            }).value,
        ).toBeCloseTo(250, 9);
    });

    it('is labelled an approximation valid near a fresh eval', () => {
        expect(
            feeEquivalentTradeRisk({
                ...videoFeeEquivalent,
                risk: dollars(100),
            }).disclosures,
        ).toContain(EconomicsDisclosure.NearFreshEvalApproximation);
    });

    it('takes the retry fee from a real plan through FeeSchedule, not a second price table', () => {
        const plan = findFirm(FirmId.Apex)?.findPlan({
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Eod,
        });
        if (!plan) throw new Error('Apex 50K EOD plan not found');
        const fee = retryFee(plan.fees);
        expect(fee).toBeGreaterThan(0);
        const drawdown = plan.drawdown.amount;
        expect(
            feeEquivalentTradeRisk({
                evalDrawdown: dollars(drawdown),
                retryFee: dollars(fee),
                risk: dollars(drawdown / 4),
            }).value,
        ).toBeCloseTo(fee / 4, 9);
        expect(
            bustCost({
                phase: TradingPhase.Eval,
                retryFee: dollars(fee),
                valueFreshEval: dollars(0),
                valueNow: dollars(0),
            }).value,
        ).toBeCloseTo(fee, 9);
    });

    it.each([
        { evalDrawdown: 0, risk: 100 },
        { evalDrawdown: 4500, risk: -1 },
        { evalDrawdown: NaN, risk: 100 },
    ])('refuses %o', ({ evalDrawdown, risk }) => {
        expect(
            feeEquivalentTradeRisk({
                evalDrawdown: dollars(evalDrawdown),
                retryFee: dollars(250),
                risk: dollars(risk),
            }).reason,
        ).toBe(EconomicsReason.InvalidInput);
    });

    it('exposes no helper that sums historical fees as at risk', () => {
        const names = Object.keys(economics).filter((name) =>
            /fee/i.test(name),
        );
        expect(names.toSorted((a, b) => a.localeCompare(b))).toStrictEqual([
            'feeEquivalentTradeRisk',
        ]);
    });
});
