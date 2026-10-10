import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    KellyIndexStatus,
    kellySizing,
} from '~/app/(app)/prop-calculator/_components/kellySizing';
import StrategyAnalysis from '~/app/(app)/prop-calculator/_components/StrategyAnalysis';
import { buildSimInputs } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { formatCurrency, formatPercent, NOT_APPLICABLE } from '~/lib/format';
import {
    dollars,
    fraction,
    type SimInputs,
    simulate,
} from '~/lib/prop-calculator';
import {
    ECONOMICS_DISCLOSURE_TEXT,
    EconomicsDisclosure,
    fullKellyFraction,
    requiredR,
} from '~/lib/prop-calculator/economics';

vi.mock('~/components/ui/InfoPopover', () => ({
    default: () => null,
}));

const FAST_TRIALS = 200;

function inputsOf(): SimInputs {
    return {
        ...buildSimInputs(defaultCalculatorState()),
        trials: FAST_TRIALS,
    };
}

describe('StrategyAnalysis edge leverage and net R to pass (F-V9, PT-61b)', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('shows the edge leverage readout as EV per attempt over attempt cost', () => {
        const baseInputs = inputsOf();
        const result = simulate(baseInputs);
        const leverage = result.expectedNetPerAttempt / result.costPerAttempt;
        act(() => {
            root.render(
                <StrategyAnalysis baseInputs={baseInputs} result={result} />,
            );
        });
        expect(container.textContent).toContain('Edge leverage');
        expect(container.textContent).toContain(`${leverage.toFixed(2)}×`);
    });

    it('shows net R to pass from the required-R economics helper', () => {
        const baseInputs = inputsOf();
        const result = simulate(baseInputs);
        const required = requiredR(
            dollars(result.profitTarget),
            dollars(baseInputs.riskPerTrade),
        );
        if (required.value === null) throw new Error('expected a value');
        act(() => {
            root.render(
                <StrategyAnalysis baseInputs={baseInputs} result={result} />,
            );
        });
        expect(container.textContent).toContain('Net R to pass');
        expect(container.textContent).toContain(
            `${required.value.toFixed(1)}R`,
        );
    });

    it('shows n/a for net R to pass on an instant-funded plan, which has no eval', () => {
        const baseInputs = inputsOf();
        const instantPlan = baseInputs.plan.withOverrides({
            isInstantFunded: true,
        });
        const withInstant = { ...baseInputs, plan: instantPlan };
        const result = simulate(withInstant);
        act(() => {
            root.render(
                <StrategyAnalysis baseInputs={withInstant} result={result} />,
            );
        });
        const netRLabel = [...container.querySelectorAll('span')].find(
            (node) => node.textContent === 'Net R to pass',
        );
        const value = netRLabel?.nextElementSibling;
        expect(value?.textContent).toBe(NOT_APPLICABLE);
    });
});

describe('StrategyAnalysis Kelly as information only (PT-53 handoff, PT-86)', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
    });

    function renderAnalysis(baseInputs: SimInputs) {
        const result = simulate(baseInputs);
        act(() => {
            root.render(
                <StrategyAnalysis baseInputs={baseInputs} result={result} />,
            );
        });
        return result;
    }

    function valueOf(label: string): string {
        const labelNode = [...container.querySelectorAll('span')].find((node) =>
            node.textContent.startsWith(label),
        );
        if (labelNode === undefined) throw new Error(`no label ${label}`);
        return labelNode.nextElementSibling?.textContent ?? '';
    }

    it('never calls half Kelly recommended', () => {
        renderAnalysis(inputsOf());
        expect(container.textContent).toContain('Half Kelly');
        expect(container.textContent).not.toContain('(rec.)');
        expect(container.textContent.toLowerCase()).not.toContain(
            'recommended',
        );
    });

    it('prints the Kelly is not prop sizing disclosure beside the Kelly figures', () => {
        renderAnalysis(inputsOf());
        expect(container.textContent).toContain(
            ECONOMICS_DISCLOSURE_TEXT[EconomicsDisclosure.KellyNotPropSizing],
        );
    });

    it('keeps the documented eval and funded rules as the sizing headline', () => {
        renderAnalysis(inputsOf());
        expect(container.textContent).toContain(
            'Size by the documented eval and funded rules (Hard Rules 3 and 5)',
        );
    });

    it('measures the average risk against the drawdown, not the account size', () => {
        const baseInputs = inputsOf();
        const result = renderAnalysis(baseInputs);
        const drawdown = baseInputs.plan.drawdown.amount;
        const sizing = kellySizing(baseInputs, {
            averageRiskPerTrade: result.averageRiskPerTrade,
            riskBasis: dollars(drawdown),
        });
        expect(sizing.currentRiskFraction).not.toBeNull();
        expect(valueOf('Average risk')).toBe(
            formatPercent(sizing.currentRiskFraction ?? NaN),
        );
        expect(valueOf('Average risk')).not.toBe(
            formatPercent(result.averageRiskPerTrade / result.accountSize),
        );
        expect(container.textContent).toContain(
            `of the ${formatCurrency(drawdown)} eval drawdown`,
        );
    });

    it('shows the full Kelly as dollars per trade against the drawdown', () => {
        const baseInputs = inputsOf();
        renderAnalysis(baseInputs);
        const drawdown = baseInputs.plan.drawdown.amount;
        const kelly = fullKellyFraction(
            fraction(baseInputs.winrate),
            baseInputs.rrRatio,
        ).value;
        expect(kelly).toBeGreaterThan(0);
        expect(valueOf('Full Kelly')).toContain(
            formatCurrency((kelly ?? 0) * drawdown),
        );
    });
    function kellyBlockText(): string {
        const heading = [...container.querySelectorAll('p')].find(
            (node) => node.textContent === 'Kelly (information only)',
        );
        return heading?.parentElement?.textContent ?? '';
    }

    it('shows the Kelly index as a ratio to full Kelly with no sizing verdict', () => {
        const baseInputs = inputsOf();
        const result = renderAnalysis(baseInputs);
        const sizing = kellySizing(baseInputs, {
            averageRiskPerTrade: result.averageRiskPerTrade,
            riskBasis: baseInputs.plan.drawdown.amount,
        });
        expect(sizing.kellyIndex.status).toBe(KellyIndexStatus.Sized);
        const value = valueOf('Kelly index');
        expect(value).toContain('full Kelly');
        expect(value).toMatch(/^\d+\.\d{2}× full Kelly$/);
        const block = kellyBlockText().toLowerCase();
        for (const verdict of [
            'optimal',
            'betting',
            'high variance',
            'recommend',
        ]) {
            expect(block).not.toContain(verdict);
        }
    });

    it('names the drawdown basis under the Kelly index and the phases the average risk spans', () => {
        const baseInputs = inputsOf();
        renderAnalysis(baseInputs);
        const basis = `of the ${formatCurrency(baseInputs.plan.drawdown.amount)} eval drawdown`;
        const indexLabel = [...container.querySelectorAll('span')].find(
            (node) => node.textContent === 'Kelly index',
        );
        const indexBlock = indexLabel?.parentElement?.textContent ?? '';
        expect(indexBlock).toContain(basis);
        const riskLabel = [...container.querySelectorAll('span')].find(
            (node) => node.textContent === 'Average risk',
        );
        const riskBlock = riskLabel?.parentElement?.textContent ?? '';
        expect(riskBlock).toContain(basis);
        expect(riskBlock).toContain('eval and funded trades');
    });
});
