import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    BankrollField,
    BankrollFieldKind,
} from '~/app/(app)/prop-calculator/_components/bankroll/BankrollField';

const FIELD_ID = 'bankroll-field-under-test';

function setInputValue(input: HTMLInputElement, value: string): void {
    Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
    )?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('BankrollField', () => {
    let root: Root;
    let container: HTMLElement;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.unstubAllGlobals();
    });

    function input(): HTMLInputElement {
        const element = container.querySelector(`#${FIELD_ID}`);
        if (!(element instanceof HTMLInputElement)) {
            throw new TypeError('no field input');
        }
        return element;
    }

    it('labels the input with a short label and puts the explanation behind an info button', () => {
        act(() => {
            root.render(
                <BankrollField
                    id={FIELD_ID}
                    info="Trading days to simulate."
                    label="Horizon"
                    onChange={vi.fn()}
                />,
            );
        });
        const label = container.querySelector('[data-slot="field-label"]');
        expect(label?.textContent).toBe('Horizon');
        expect(label?.getAttribute('for')).toBe(FIELD_ID);
        expect(label?.nextElementSibling?.getAttribute('aria-label')).toBe(
            'About Horizon',
        );
        expect(container.textContent).not.toContain('Trading days');
    });

    it.each([
        {
            inputMode: 'decimal',
            kind: BankrollFieldKind.Decimal,
            step: 'any',
            type: 'number',
        },
        {
            inputMode: 'numeric',
            kind: BankrollFieldKind.Integer,
            step: '1',
            type: 'number',
        },
        {
            inputMode: null,
            kind: BankrollFieldKind.List,
            step: null,
            type: 'text',
        },
    ])(
        'gives a $kind field the $type input it needs',
        ({ inputMode, kind, step, type }) => {
            act(() => {
                root.render(
                    <BankrollField
                        id={FIELD_ID}
                        info="info"
                        kind={kind}
                        label="Field"
                        onChange={vi.fn()}
                    />,
                );
            });
            expect(input().type).toBe(type);
            expect(input().getAttribute('inputmode')).toBe(inputMode);
            expect(input().getAttribute('step')).toBe(step);
        },
    );

    it('starts from the initial value and reports and keeps every raw keystroke', () => {
        const onChange = vi.fn();
        act(() => {
            root.render(
                <BankrollField
                    id={FIELD_ID}
                    info="info"
                    initial={2500}
                    label="Budget"
                    onChange={onChange}
                />,
            );
        });
        expect(input().value).toBe('2500');
        act(() => {
            setInputValue(input(), '-1');
        });
        expect(onChange).toHaveBeenLastCalledWith('-1');
        expect(input().value).toBe('-1');
    });

    it('marks an invalid field and wires its description', () => {
        act(() => {
            root.render(
                <BankrollField
                    describedBy="field-note"
                    id={FIELD_ID}
                    info="info"
                    isInvalid
                    kind={BankrollFieldKind.List}
                    label="Budgets"
                    onChange={vi.fn()}
                >
                    <p id="field-note">Too many</p>
                </BankrollField>,
            );
        });
        expect(input().getAttribute('aria-invalid')).toBe('true');
        expect(input().getAttribute('aria-describedby')).toBe('field-note');
        const field = container.querySelector('[data-slot="field"]');
        expect(
            field instanceof HTMLElement ? field.dataset.invalid : undefined,
        ).toBe('true');
        expect(container.textContent).toContain('Too many');
    });
});
