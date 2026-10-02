import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import TradingInputs from '~/app/(app)/prop-calculator/_components/TradingInputs';

function hazardInput(): HTMLInputElement {
    const input = document.body.querySelector<HTMLInputElement>(
        '#live-transfer-hazard',
    );
    if (input === null) throw new Error('no hazard input');
    return input;
}

function renderInputs(
    hazard: number,
    onChange: (n: number) => void,
): React.ReactElement {
    const state = defaultCalculatorState();
    const noop = vi.fn();
    return (
        <TradingInputs
            activationDiscountPercent={state.activationDiscountPercent}
            commissionPerRoundTrip={state.commissionPerRoundTrip}
            copyAccounts={state.copyAccounts}
            dayStop={state.dayStop}
            evalDiscountPercent={state.evalDiscountPercent}
            firmDisplayName={state.firm.displayName}
            idleDayProbability={state.idleDayProbability}
            instrument={state.instrument}
            linkActivationDiscount={state.linkActivationDiscount}
            liveTransferHazard={hazard}
            maxAttempts={state.maxAttempts}
            maxCopyAccounts={state.firm.maxFundedAccounts(state.plan)}
            maxEvalDays={state.maxEvalDays}
            monthlySubscriptionDiscountPercent={
                state.monthlySubscriptionDiscountPercent
            }
            onActivationDiscountPercentChange={noop}
            onCommissionPerRoundTripChange={noop}
            onCopyAccountsChange={noop}
            onDayStopChange={noop}
            onEvalDiscountPercentChange={noop}
            onIdleDayProbabilityChange={noop}
            onInstrumentChange={noop}
            onLinkActivationDiscountChange={noop}
            onLiveTransferHazardChange={onChange}
            onMaxAttemptsChange={noop}
            onMaxEvalDaysChange={noop}
            onMonthlySubscriptionDiscountPercentChange={noop}
            onPayoutRequestSizeChange={noop}
            onResetCoupon={noop}
            onResetDiscountPercentChange={noop}
            onRetainedCushionChange={noop}
            onRiskDollarsChange={noop}
            onRiskPercentChange={noop}
            onRrRatioChange={noop}
            onRungSizingChange={noop}
            onSeedChange={noop}
            onSizingModeChange={noop}
            onStopPointsChange={noop}
            onTakesFundedResetChange={noop}
            onTakesOneTimeEarlyWithdrawalChange={noop}
            onTradesPerDayChange={noop}
            onTrialsChange={noop}
            onWinrateChange={noop}
            payoutRequestSize={state.payoutRequestSize}
            plan={state.plan}
            resetDiscountPercent={state.resetDiscountPercent}
            retainedCushion={state.retainedCushion}
            riskDollars={state.riskDollars}
            riskPercent={state.riskPercent}
            rrRatio={state.rrRatio}
            rungSizing={state.rungSizing}
            seed={state.seed}
            sizingMode={state.sizingMode}
            stopPoints={state.stopPoints}
            takesFundedReset={state.takesFundedReset}
            takesOneTimeEarlyWithdrawal={state.takesOneTimeEarlyWithdrawal}
            tradesPerDay={state.tradesPerDay}
            trials={state.trials}
            winrate={state.winrate}
        />
    );
}

describe('TradingInputs live-transfer hazard input (PT-73, F-V26)', () => {
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
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    function openAdvanced() {
        const trigger = container.querySelector<HTMLButtonElement>(
            'button[aria-label="Advanced settings"]',
        );
        if (trigger === null) throw new Error('no advanced settings trigger');
        act(() => {
            trigger.click();
        });
    }

    it('shows the hazard in the advanced settings and says it is your assumption, not a firm rule', () => {
        act(() => {
            root.render(renderInputs(0.2, vi.fn()));
        });
        openAdvanced();
        expect(hazardInput().value).toBe('0.2');
        const label = document.body.querySelector(
            'label[for="live-transfer-hazard"]',
        );
        expect(label?.textContent).toContain('Live-transfer hazard');
        expect(document.body.textContent).toContain(
            'your assumption, not a firm rule',
        );
    });

    it('reports a typed hazard to the calculator', () => {
        const onChange = vi.fn();
        act(() => {
            root.render(renderInputs(0, onChange));
        });
        openAdvanced();
        act(() => {
            Reflect.set(HTMLInputElement.prototype, 'value', '0.3', hazardInput());
            hazardInput().dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(onChange).toHaveBeenCalledWith(0.3);
    });

    it('says only the strategy lab prices it and that the results and the other tools stay unpriced', () => {
        act(() => {
            root.render(renderInputs(0.2, vi.fn()));
        });
        openAdvanced();
        const text = document.body.textContent;
        expect(text).toContain('Only the strategy lab uses it');
        expect(text).toContain(
            'the results, sizing, compare and the other tools stay unpriced',
        );
        expect(text).not.toContain('The results and the strategy lab use it');
    });

    it('says what a transfer is worth after it in the lab, including the $0 case and the sizing it needs', () => {
        act(() => {
            root.render(renderInputs(0.2, vi.fn()));
        });
        openAdvanced();
        const text = document.body.textContent;
        expect(text).toContain('valued at $0');
        expect(text).toContain('instrument and stop points');
    });

    it('never uses an em dash in its help text', () => {
        act(() => {
            root.render(renderInputs(0, vi.fn()));
        });
        openAdvanced();
        expect(document.body.textContent).not.toContain('\u{2014}');
    });
});
