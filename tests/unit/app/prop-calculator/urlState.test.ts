import { describe, expect, it } from 'vitest';

import type {
    CalculatorState,
    LabScenario,
    PortfolioEntry,
} from '~/app/(app)/prop-calculator/_components/types';

import { SizingMode } from '~/app/(app)/prop-calculator/_components/types';
import {
    decodeState,
    encodeState,
} from '~/app/(app)/prop-calculator/_components/urlState';
import {
    ApexVariant,
    CorrelationMode,
    DayStopRuleKind,
    FirmId,
    InstrumentSymbol,
    RungSizing,
} from '~/lib/prop-calculator';
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
        idleDayProbability: 0,
        instrument: null,
        labScenarios: [],
        linkActivationDiscount: false,
        maxAttempts: 1,
        maxEvalDays: 60,
        monthlySubscriptionDiscountPercent: 0,
        payoutRequestSize: null,
        plan,
        portfolio: [],
        resetDiscountPercent: 0,
        retainedCushion: null,
        riskDollars: 250,
        riskPercent: 0.5,
        rrRatio: 2,
        rungSizing: RungSizing.CapToCushion,
        seed: 42,
        sizingMode: SizingMode.Dollar,
        stopPoints: null,
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

describe('instrument/stopPoints round-trip through the URL (contract-limit enforcement)', () => {
    it('omits instr/sp from the URL when position sizing is unset', () => {
        const parameters = encodeState(fallbackState());
        expect(parameters.has('instr')).toBe(false);
        expect(parameters.has('sp')).toBe(false);
    });

    it('round-trips a set instrument + stopPoints through encode then decode', () => {
        const state: CalculatorState = {
            ...fallbackState(),
            instrument: InstrumentSymbol.NQ,
            stopPoints: 12.5,
        };
        const parameters = encodeState(state);
        expect(parameters.get('instr')).toBe(InstrumentSymbol.NQ);
        expect(parameters.get('sp')).toBe('12.5');

        const decoded = decodeState(parameters, ALL_FIRMS, fallbackState());
        expect(decoded.instrument).toBe(InstrumentSymbol.NQ);
        expect(decoded.stopPoints).toBe(12.5);
    });

    it('ignores an unrecognized instrument symbol and leaves position sizing unset', () => {
        const { firm, plan } = apexEod();
        const parameters = new URLSearchParams({
            firm: firm.id,
            instr: 'NOT-A-REAL-SYMBOL',
            plan: `${FirmId.Apex}-${plan.id.accountSize}-${ApexVariant.Eod}`,
            sp: '10',
        });

        const state = decodeState(parameters, ALL_FIRMS, fallbackState());

        expect(state.instrument).toBeNull();
        expect(state.stopPoints).toBeNull();
    });

    it('clamps an out-of-range stopPoints to the shared schema bounds', () => {
        const { firm, plan } = apexEod();
        const parameters = new URLSearchParams({
            firm: firm.id,
            instr: InstrumentSymbol.NQ,
            plan: `${FirmId.Apex}-${plan.id.accountSize}-${ApexVariant.Eod}`,
            sp: '999999',
        });

        const state = decodeState(parameters, ALL_FIRMS, fallbackState());

        expect(state.instrument).toBe(InstrumentSymbol.NQ);
        expect(state.stopPoints).toBe(10_000);
    });
});

describe('retainedCushion round-trip through the URL (E14 revisit)', () => {
    it('omits rc from the URL when retainedCushion is unset (null means "use plan default")', () => {
        const parameters = encodeState(fallbackState());
        expect(parameters.has('rc')).toBe(false);
    });

    it('round-trips a set retainedCushion through encode then decode', () => {
        const state: CalculatorState = {
            ...fallbackState(),
            retainedCushion: 2500,
        };
        const parameters = encodeState(state);
        expect(parameters.get('rc')).toBe('2500');

        const decoded = decodeState(parameters, ALL_FIRMS, fallbackState());
        expect(decoded.retainedCushion).toBe(2500);
    });

    it('leaves retainedCushion null when rc is absent from the URL', () => {
        const { firm, plan } = apexEod();
        const parameters = new URLSearchParams({
            firm: firm.id,
            plan: `${FirmId.Apex}-${plan.id.accountSize}-${ApexVariant.Eod}`,
        });

        const state = decodeState(parameters, ALL_FIRMS, fallbackState());

        expect(state.retainedCushion).toBeNull();
    });

    it('clamps an out-of-range retainedCushion to the shared schema bounds', () => {
        const { firm, plan } = apexEod();
        const parameters = new URLSearchParams({
            firm: firm.id,
            plan: `${FirmId.Apex}-${plan.id.accountSize}-${ApexVariant.Eod}`,
            rc: '999999999',
        });

        const state = decodeState(parameters, ALL_FIRMS, fallbackState());

        expect(state.retainedCushion).toBe(100_000);
    });
});

describe('per-surface contract-limit enforcement round-trips through the "lab"/"pf" blobs', () => {
    it('round-trips a Lab Scenario carrying its own instrument + stopPoints', () => {
        const { firm, plan } = apexEod();
        const scenario: LabScenario = {
            accounts: 5,
            correlation: CorrelationMode.Copy,
            dayStop: { kind: DayStopRuleKind.None },
            groups: 1,
            id: 'sc-1',
            instrument: InstrumentSymbol.MNQ,
            label: 'Test',
            riskPerTrade: 300,
            rrRatio: 2,
            stopPoints: 8,
            tradesPerDay: 2,
            winrate: 0.5,
        };
        const state: CalculatorState = {
            ...fallbackState(),
            firm,
            labScenarios: [scenario],
            plan,
        };
        const parameters = encodeState(state);
        expect(parameters.has('lab')).toBe(true);

        const decoded = decodeState(parameters, ALL_FIRMS, fallbackState());

        expect(decoded.labScenarios).toHaveLength(1);
        expect(decoded.labScenarios[0]?.instrument).toBe(InstrumentSymbol.MNQ);
        expect(decoded.labScenarios[0]?.stopPoints).toBe(8);
    });

    it('round-trips a Portfolio entry carrying its own instrument + stopPoints override', () => {
        const { firm, plan } = apexEod();
        const entry: PortfolioEntry = {
            activationDiscountPercent: 0,
            count: 1,
            evalDiscountPercent: 0,
            firmId: firm.id,
            id: 'entry-1',
            instrument: InstrumentSymbol.NQ,
            linkActivationDiscount: false,
            monthlySubscriptionDiscountPercent: 15,
            planId: plan.id,
            resetDiscountPercent: 20,
            stopPoints: 10,
        };
        const state: CalculatorState = {
            ...fallbackState(),
            firm,
            plan,
            portfolio: [entry],
        };
        const parameters = encodeState(state);
        expect(parameters.has('pf')).toBe(true);

        const decoded = decodeState(parameters, ALL_FIRMS, fallbackState());

        expect(decoded.portfolio).toHaveLength(1);
        expect(decoded.portfolio[0]?.instrument).toBe(InstrumentSymbol.NQ);
        expect(decoded.portfolio[0]?.stopPoints).toBe(10);
        expect(decoded.portfolio[0]?.monthlySubscriptionDiscountPercent).toBe(
            15,
        );
        expect(decoded.portfolio[0]?.resetDiscountPercent).toBe(20);
    });

    it('leaves a Portfolio entry without an override as null (inherits the global setting)', () => {
        const { firm, plan } = apexEod();
        const entry: PortfolioEntry = {
            activationDiscountPercent: 0,
            count: 1,
            evalDiscountPercent: 0,
            firmId: firm.id,
            id: 'entry-1',
            instrument: null,
            linkActivationDiscount: false,
            monthlySubscriptionDiscountPercent: 0,
            planId: plan.id,
            resetDiscountPercent: 0,
            stopPoints: null,
        };
        const state: CalculatorState = {
            ...fallbackState(),
            firm,
            plan,
            portfolio: [entry],
        };
        const parameters = encodeState(state);
        const decoded = decodeState(parameters, ALL_FIRMS, fallbackState());

        expect(decoded.portfolio[0]?.instrument).toBeNull();
        expect(decoded.portfolio[0]?.stopPoints).toBeNull();
    });
});

describe('monthlySubscriptionDiscountPercent / resetDiscountPercent round-trip through the URL (H2)', () => {
    it('is present in the URL unconditionally, like eval/act, not omitted like rc/pr', () => {
        const parameters = encodeState(fallbackState());
        expect(parameters.has('msub')).toBe(true);
        expect(parameters.has('rstd')).toBe(true);
        expect(parameters.get('msub')).toBe('0');
        expect(parameters.get('rstd')).toBe('0');
    });

    it('round-trips set values through encode then decode', () => {
        const state: CalculatorState = {
            ...fallbackState(),
            monthlySubscriptionDiscountPercent: 40,
            resetDiscountPercent: 25,
        };
        const parameters = encodeState(state);
        expect(parameters.get('msub')).toBe('40');
        expect(parameters.get('rstd')).toBe('25');

        const decoded = decodeState(parameters, ALL_FIRMS, fallbackState());
        expect(decoded.monthlySubscriptionDiscountPercent).toBe(40);
        expect(decoded.resetDiscountPercent).toBe(25);
    });

    it('falls back to the schema default (not a clamp) on an out-of-range value, same as eval/act', () => {
        const { firm, plan } = apexEod();
        const parameters = new URLSearchParams({
            firm: firm.id,
            msub: '999',
            plan: `${FirmId.Apex}-${plan.id.accountSize}-${ApexVariant.Eod}`,
            rstd: '-50',
        });

        const state = decodeState(parameters, ALL_FIRMS, fallbackState());

        expect(state.monthlySubscriptionDiscountPercent).toBe(0);
        expect(state.resetDiscountPercent).toBe(0);
    });

    it('falls back to the schema default on non-numeric input', () => {
        const { firm, plan } = apexEod();
        const parameters = new URLSearchParams({
            firm: firm.id,
            msub: 'not-a-number',
            plan: `${FirmId.Apex}-${plan.id.accountSize}-${ApexVariant.Eod}`,
        });

        const state = decodeState(parameters, ALL_FIRMS, fallbackState());

        expect(state.monthlySubscriptionDiscountPercent).toBe(0);
    });
});

describe('payoutRequestSize round-trip through the URL (H3)', () => {
    it('omits pr from the URL when payoutRequestSize is unset (null means "withdraw everything")', () => {
        const parameters = encodeState(fallbackState());
        expect(parameters.has('pr')).toBe(false);
    });

    it('round-trips a set payoutRequestSize through encode then decode', () => {
        const state: CalculatorState = {
            ...fallbackState(),
            payoutRequestSize: 5000,
        };
        const parameters = encodeState(state);
        expect(parameters.get('pr')).toBe('5000');

        const decoded = decodeState(parameters, ALL_FIRMS, fallbackState());
        expect(decoded.payoutRequestSize).toBe(5000);
    });

    it('leaves payoutRequestSize null when pr is absent from the URL', () => {
        const { firm, plan } = apexEod();
        const parameters = new URLSearchParams({
            firm: firm.id,
            plan: `${FirmId.Apex}-${plan.id.accountSize}-${ApexVariant.Eod}`,
        });

        const state = decodeState(parameters, ALL_FIRMS, fallbackState());

        expect(state.payoutRequestSize).toBeNull();
    });

    it('clamps an out-of-range payoutRequestSize to the shared schema bounds', () => {
        const { firm, plan } = apexEod();
        const parameters = new URLSearchParams({
            firm: firm.id,
            plan: `${FirmId.Apex}-${plan.id.accountSize}-${ApexVariant.Eod}`,
            pr: '999999999',
        });

        const state = decodeState(parameters, ALL_FIRMS, fallbackState());

        expect(state.payoutRequestSize).toBe(1_000_000);
    });
});

describe('rungSizing round-trip through the URL (H4)', () => {
    it('is present in the URL unconditionally, defaulting to capToCushion', () => {
        const parameters = encodeState(fallbackState());
        expect(parameters.get('rung')).toBe(RungSizing.CapToCushion);
    });

    it('round-trips skipIfUnaffordable through encode then decode', () => {
        const state: CalculatorState = {
            ...fallbackState(),
            rungSizing: RungSizing.SkipIfUnaffordable,
        };
        const parameters = encodeState(state);
        expect(parameters.get('rung')).toBe(RungSizing.SkipIfUnaffordable);

        const decoded = decodeState(parameters, ALL_FIRMS, fallbackState());
        expect(decoded.rungSizing).toBe(RungSizing.SkipIfUnaffordable);
    });

    it('falls back to capToCushion on an unrecognized rung value', () => {
        const { firm, plan } = apexEod();
        const parameters = new URLSearchParams({
            firm: firm.id,
            plan: `${FirmId.Apex}-${plan.id.accountSize}-${ApexVariant.Eod}`,
            rung: 'not-a-real-mode',
        });

        const state = decodeState(parameters, ALL_FIRMS, fallbackState());

        expect(state.rungSizing).toBe(RungSizing.CapToCushion);
    });
});
