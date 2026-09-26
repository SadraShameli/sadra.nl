import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    type TradingPlanSource,
    TradingPlanSourceKind,
} from '~/app/(app)/prop-calculator/accounts/rulebook/rulebookFromTradingPlan';
import { RulebookView } from '~/app/(app)/prop-calculator/accounts/rulebook/RulebookView';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import { DEFAULT_PLAN } from '~/lib/trading/defaults';

const harness = vi.hoisted(() => ({
    invalidate: vi.fn(() => Promise.resolve()),
    mutateAsync: vi.fn(() => Promise.resolve()),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            rulebook: {
                get: {
                    useQuery: () => ({
                        data: DEFAULT_RULEBOOK,
                        isError: false,
                        isPending: false,
                    }),
                },
                reset: {
                    useMutation: () => ({
                        isPending: false,
                        mutateAsync: harness.mutateAsync,
                    }),
                },
                upsert: {
                    useMutation: () => ({
                        isPending: false,
                        mutateAsync: harness.mutateAsync,
                    }),
                },
            },
        },
        useUtils: () => ({
            propAccounts: { invalidate: harness.invalidate },
        }),
    },
}));

vi.mock('sonner', () => ({
    toast: { error: harness.toastError, success: harness.toastSuccess },
}));

const FIX_FIELDS_HINT = 'Fix the highlighted fields first.';

const READY_PLAN: TradingPlanSource = {
    kind: TradingPlanSourceKind.Ready,
    name: 'My trading plan',
    risk: { ...DEFAULT_PLAN.risk, fundedDollars: 200, maxTradesPerWindow: 2 },
};

function click(button: HTMLButtonElement) {
    act(() => {
        button.focus();
        button.click();
    });
}

function typeInto(input: HTMLInputElement, text: string) {
    act(() => {
        Reflect.set(HTMLInputElement.prototype, 'value', text, input);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

describe('RulebookView import preview', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.toastError.mockClear();
        harness.toastSuccess.mockClear();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(<RulebookView tradingPlan={READY_PLAN} />);
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
    });

    function buttonNamed(name: string): HTMLButtonElement | undefined {
        return [...container.querySelectorAll('button')].find(
            (button) => button.textContent.trim() === name,
        );
    }

    function toggle(): HTMLButtonElement {
        const button =
            buttonNamed('Preview import') ?? buttonNamed('Hide import preview');
        if (button === undefined) throw new Error('no preview toggle');
        return button;
    }

    function previewRegion(): HTMLElement {
        const region = container.querySelector<HTMLElement>(
            '[role="region"][aria-label="Import preview"]',
        );
        if (region === null) throw new Error('no preview region');
        return region;
    }

    function inputLabelled(label: string): HTMLInputElement {
        const labelElement = [...container.querySelectorAll('label')].find(
            (candidate) => candidate.textContent.startsWith(label),
        );
        const input =
            labelElement === undefined
                ? null
                : container.querySelector(
                      `#${CSS.escape(labelElement.htmlFor)}`,
                  );
        if (!(input instanceof HTMLInputElement)) {
            throw new TypeError(`no input labelled ${label}`);
        }
        return input;
    }

    it('opens and closes the preview, reporting its state through aria-expanded and aria-controls', () => {
        const button = toggle();
        expect(button.getAttribute('aria-expanded')).toBe('false');
        expect(button.getAttribute('aria-controls')).toBe(previewRegion().id);
        expect(previewRegion().textContent).toBe('');

        click(button);
        expect(toggle().getAttribute('aria-expanded')).toBe('true');
        expect(toggle().textContent).toBe('Hide import preview');
        expect(previewRegion().textContent).toContain('Apply to the form');

        click(toggle());
        expect(toggle().getAttribute('aria-expanded')).toBe('false');
        expect(toggle().textContent).toBe('Preview import');
        expect(previewRegion().textContent).toBe('');
    });

    it('shows the fix-fields hint and keeps the toggle usable when the form turns invalid with the preview open', () => {
        click(toggle());
        typeInto(inputLabelled('Funded risk per trade'), 'abc');

        expect(container.textContent).toContain(FIX_FIELDS_HINT);
        expect(previewRegion().textContent).toBe('');
        expect(toggle().getAttribute('aria-expanded')).toBe('true');
        expect(toggle().disabled).toBe(false);

        click(toggle());
        expect(toggle().getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(toggle());
        expect(toggle().disabled).toBe(false);
        expect(toggle().getAttribute('aria-disabled')).toBe('true');
        expect(container.textContent).toContain(FIX_FIELDS_HINT);
    });

    it('keeps the unavailable toggle focusable, described by the hint, and inert while the form is invalid', () => {
        typeInto(inputLabelled('Funded risk per trade'), 'abc');

        const button = toggle();
        expect(button.disabled).toBe(false);
        expect(button.getAttribute('aria-disabled')).toBe('true');
        const hintId = button.getAttribute('aria-describedby');
        expect(hintId).not.toBeNull();
        expect(
            container.querySelector(`#${CSS.escape(hintId ?? '')}`)
                ?.textContent,
        ).toBe(FIX_FIELDS_HINT);

        click(button);
        expect(document.activeElement).toBe(toggle());
        expect(toggle().getAttribute('aria-expanded')).toBe('false');
        expect(toggle().textContent).toBe('Preview import');
        expect(previewRegion().textContent).toBe('');
    });

    it('hides the hint and makes the toggle available again once the form is valid', () => {
        const input = inputLabelled('Funded risk per trade');
        typeInto(input, 'abc');
        expect(toggle().getAttribute('aria-disabled')).toBe('true');

        typeInto(input, '250');
        expect(toggle().disabled).toBe(false);
        expect(toggle().getAttribute('aria-disabled')).toBeNull();
        expect(toggle().getAttribute('aria-describedby')).toBeNull();
        expect(container.textContent).not.toContain(FIX_FIELDS_HINT);
    });

    it('returns focus to the toggle when the preview is cancelled', () => {
        click(toggle());
        const cancel = buttonNamed('Cancel');
        if (cancel === undefined) throw new Error('no cancel button');

        click(cancel);
        expect(document.activeElement).toBe(toggle());
        expect(toggle().getAttribute('aria-expanded')).toBe('false');
    });

    it('returns focus to the toggle after applying the import to the form', () => {
        click(toggle());
        const apply = buttonNamed('Apply to the form');
        if (apply === undefined) throw new Error('no apply button');
        expect(apply.disabled).toBe(false);

        click(apply);
        expect(document.activeElement).toBe(toggle());
        expect(toggle().getAttribute('aria-expanded')).toBe('false');
        expect(inputLabelled('Funded risk per trade').value).toBe('200');
        expect(inputLabelled('Max trades per window').value).toBe('2');
        expect(harness.toastSuccess).toHaveBeenCalledWith(
            'Imported into the form. Save to keep it.',
        );
    });
});
