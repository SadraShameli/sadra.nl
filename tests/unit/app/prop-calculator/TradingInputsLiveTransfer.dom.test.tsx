import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TradingInputs from '~/app/(app)/prop-calculator/_components/TradingInputs';

import { infoText } from './infoPopover';
import { tradingInputsProperties } from './tradingInputsFixture';

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
    return (
        <TradingInputs
            {...tradingInputsProperties({
                liveTransferHazard: hazard,
                onLiveTransferHazardChange: onChange,
            })}
        />
    );
}

const HAZARD_LABEL = 'Live-transfer hazard per paid payout';

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
        expect(infoText(document.body, HAZARD_LABEL)).toContain(
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
            Reflect.set(
                HTMLInputElement.prototype,
                'value',
                '0.3',
                hazardInput(),
            );
            hazardInput().dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(onChange).toHaveBeenCalledWith(0.3);
    });

    it('says only the strategy lab prices it and that the results and the other tools stay unpriced', () => {
        act(() => {
            root.render(renderInputs(0.2, vi.fn()));
        });
        openAdvanced();
        const text = infoText(document.body, HAZARD_LABEL);
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
        const text = infoText(document.body, HAZARD_LABEL);
        expect(text).toContain('valued at $0');
        expect(text).toContain('instrument and stop points');
    });

    it('never uses an em dash in its help text', () => {
        act(() => {
            root.render(renderInputs(0, vi.fn()));
        });
        openAdvanced();
        const visible = document.body.textContent;
        expect(
            `${visible}${infoText(document.body, HAZARD_LABEL)}`,
        ).not.toContain('\u{2014}');
    });
});
