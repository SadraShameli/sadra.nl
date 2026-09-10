import { describe, expect, it } from 'vitest';

import type { CalculatorState } from '~/app/(app)/prop-calculator/_components/types';

import { SizingMode } from '~/app/(app)/prop-calculator/_components/types';
import { decodeState } from '~/app/(app)/prop-calculator/_components/urlState';
import { ApexVariant, DayStopRuleKind, FirmId } from '~/lib/prop-calculator';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';

function apexEod() {
    const firm = ALL_FIRMS.find((f) => f.id === FirmId.Apex);
    if (!firm) throw new Error('Apex firm not registered');
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('Apex EOD 50K plan not found');
    return { firm, plan };
}

function fallbackState(): CalculatorState {
    const { firm, plan } = apexEod();
    return {
        activationDiscountPercent: 0,
        commissionPerRoundTrip: 0,
        copyAccounts: 1,
        dayStop: { kind: DayStopRuleKind.None },
        evalDayPolicy: null,
        evalDiscountPercent: 0,
        firm,
        firmMemory: {},
        fundedHorizonDays: 60,
        labScenarios: [],
        linkActivationDiscount: false,
        maxAttempts: 1,
        maxEvalDays: 60,
        plan,
        portfolio: [],
        riskDollars: 250,
        riskPercent: 0.5,
        rrRatio: 2,
        seed: 42,
        sizingMode: SizingMode.Dollar,
        tradesPerDay: 1,
        trials: 2000,
        winrate: 0.4,
    };
}

describe('decodeState clamps plan-dependent fields after resolving the plan', () => {
    it('caps riskDollars at the resolved plan account size', () => {
        const { firm, plan } = apexEod();
        const parameters = new URLSearchParams({
            firm: firm.id,
            plan: `${FirmId.Apex}-${plan.id.accountSize}-${ApexVariant.Eod}`,
            rd: '999999999',
        });

        const state = decodeState(parameters, ALL_FIRMS, fallbackState());

        expect(state.riskDollars).toBeLessThanOrEqual(plan.accountSize);
    });

    it('caps copyAccounts at the resolved firm/plan maxFundedAccounts', () => {
        const { firm, plan } = apexEod();
        const parameters = new URLSearchParams({
            copy: '999',
            firm: firm.id,
            plan: `${FirmId.Apex}-${plan.id.accountSize}-${ApexVariant.Eod}`,
        });

        const state = decodeState(parameters, ALL_FIRMS, fallbackState());

        expect(state.copyAccounts).toBeLessThanOrEqual(
            firm.maxFundedAccounts(plan),
        );
    });

    it('leaves in-range values untouched', () => {
        const { firm, plan } = apexEod();
        const parameters = new URLSearchParams({
            firm: firm.id,
            plan: `${FirmId.Apex}-${plan.id.accountSize}-${ApexVariant.Eod}`,
            rd: '500',
        });

        const state = decodeState(parameters, ALL_FIRMS, fallbackState());

        expect(state.riskDollars).toBe(500);
    });

    it('actually resolves the requested plan, not just the firm default', () => {
        const firm = ALL_FIRMS.find((f) => f.id === FirmId.Apex);
        if (!firm) throw new Error('Apex firm not registered');
        const intraday = firm.findPlan({
            accountSize: 50_000,
            firm: FirmId.Apex,
            variant: ApexVariant.Intraday,
        });
        if (!intraday) throw new Error('Apex Intraday 50K plan not found');
        expect(intraday.id).not.toStrictEqual(apexEod().plan.id);

        const parameters = new URLSearchParams({
            firm: firm.id,
            plan: `${FirmId.Apex}-${intraday.id.accountSize}-${ApexVariant.Intraday}`,
        });

        const state = decodeState(parameters, ALL_FIRMS, fallbackState());

        expect(state.plan.id).toStrictEqual(intraday.id);
    });
});
