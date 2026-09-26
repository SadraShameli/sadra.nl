import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    type TradingPlanSource,
    TradingPlanSourceKind,
} from '~/app/(app)/prop-calculator/accounts/rulebook/rulebookFromTradingPlan';
import { RulebookView } from '~/app/(app)/prop-calculator/accounts/rulebook/RulebookView';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import {
    PropRecord,
    type PropRejection,
    PropStoredRecordRejection,
} from '~/lib/schemas/propAccountOutputs';
import { DEFAULT_PLAN } from '~/lib/trading/defaults';

interface FakeRulebookQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
    isSuccess: boolean;
}

const harness = vi.hoisted(() => {
    const rulebookQuery: FakeRulebookQuery = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
        isSuccess: false,
    };
    return {
        invalidate: vi.fn(() => Promise.resolve()),
        reset: vi.fn(() => Promise.resolve({ ok: true })),
        rulebookQuery,
        toastError: vi.fn(),
        toastSuccess: vi.fn(),
        upsert: vi.fn((input: unknown) => Promise.resolve(input)),
    };
});

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts/rulebook',
    useRouter: () => ({ replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            rulebook: {
                get: { useQuery: () => harness.rulebookQuery },
                reset: {
                    useMutation: () => ({
                        isPending: false,
                        mutateAsync: harness.reset,
                    }),
                },
                upsert: {
                    useMutation: () => ({
                        isPending: false,
                        mutateAsync: harness.upsert,
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

const INVALID_RULEBOOK_MESSAGE =
    'Your stored rulebook is not valid: x. Save a valid rulebook or reset it to the defaults';

function answered(data: unknown): FakeRulebookQuery {
    return {
        data,
        error: null,
        isError: false,
        isPending: false,
        isSuccess: true,
    };
}

function buttonIn(
    scope: ParentNode,
    name: string,
): HTMLButtonElement | undefined {
    return [...scope.querySelectorAll('button')].find(
        (button) => button.textContent.trim() === name,
    );
}

function click(button: HTMLButtonElement) {
    act(() => {
        button.focus();
        button.click();
    });
}

function failed(error: Error): FakeRulebookQuery {
    return {
        data: undefined,
        error,
        isError: true,
        isPending: false,
        isSuccess: false,
    };
}

function invalidStoredRulebookError(): Error {
    const propRejection: PropRejection = {
        lifecycleRejection: null,
        limit: null,
        quota: null,
        reason: PropStoredRecordRejection.InvalidStoredRecord,
        record: PropRecord.Rulebook,
        recordId: null,
    };
    return Object.assign(new Error(INVALID_RULEBOOK_MESSAGE), {
        data: { propRejection },
    });
}

function requireButton(scope: ParentNode, name: string): HTMLButtonElement {
    const button = buttonIn(scope, name);
    if (button === undefined) throw new Error(`no ${name} button`);
    return button;
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
        harness.rulebookQuery = answered(DEFAULT_RULEBOOK);
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

describe('RulebookView when the rulebook cannot be read', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.invalidate.mockClear();
        harness.reset.mockClear();
        harness.upsert.mockClear();
        harness.toastError.mockClear();
        harness.toastSuccess.mockClear();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
    });

    function render() {
        act(() => {
            root.render(<RulebookView tradingPlan={READY_PLAN} />);
        });
    }

    function fundedRiskInput(): HTMLInputElement | null {
        const label = [...container.querySelectorAll('label')].find(
            (candidate) =>
                candidate.textContent.startsWith('Funded risk per trade'),
        );
        const input =
            label === undefined
                ? null
                : container.querySelector(`#${CSS.escape(label.htmlFor)}`);
        return input instanceof HTMLInputElement ? input : null;
    }

    it('offers a reset to the defaults and a new rulebook instead of only an alert when the stored rulebook is invalid', () => {
        harness.rulebookQuery = failed(invalidStoredRulebookError());
        render();

        expect(container.textContent).toContain(INVALID_RULEBOOK_MESSAGE);
        expect(buttonIn(container, 'Reset to skill defaults')).toBeDefined();
        expect(
            buttonIn(container, 'Overwrite with a new rulebook'),
        ).toBeDefined();
        expect(fundedRiskInput()).toBeNull();
    });

    it('resets the stored rulebook through rulebook.reset once the user confirms', async () => {
        harness.rulebookQuery = failed(invalidStoredRulebookError());
        render();

        click(requireButton(container, 'Reset to skill defaults'));
        expect(harness.reset).not.toHaveBeenCalled();
        await act(async () => {
            requireButton(document.body, 'Reset').click();
            await Promise.resolve();
        });

        expect(harness.reset).toHaveBeenCalledTimes(1);
        expect(harness.upsert).not.toHaveBeenCalled();
        expect(harness.invalidate).toHaveBeenCalled();
        expect(harness.toastSuccess).toHaveBeenCalledWith(
            'Rulebook reset to the skill defaults',
        );
    });

    it('reports a failed reset instead of claiming success', async () => {
        harness.rulebookQuery = failed(invalidStoredRulebookError());
        harness.reset.mockImplementationOnce(() =>
            Promise.reject(new Error('Too many requests')),
        );
        render();

        click(requireButton(container, 'Reset to skill defaults'));
        await act(async () => {
            requireButton(document.body, 'Reset').click();
            await Promise.resolve();
        });

        expect(harness.toastError).toHaveBeenCalledWith('Too many requests');
        expect(harness.toastSuccess).not.toHaveBeenCalled();
        expect(harness.invalidate).toHaveBeenCalled();
    });

    it('opens the form on the skill defaults to overwrite the invalid rulebook, and saving upserts it', async () => {
        harness.rulebookQuery = failed(invalidStoredRulebookError());
        render();

        click(requireButton(container, 'Overwrite with a new rulebook'));

        expect(fundedRiskInput()?.value).toBe(
            String(DEFAULT_RULEBOOK.funded.riskCents / 100),
        );
        expect(container.textContent).toContain(
            'Saving replaces your stored rulebook',
        );
        expect(harness.reset).not.toHaveBeenCalled();

        await act(async () => {
            requireButton(container, 'Save rulebook').click();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(harness.upsert).toHaveBeenCalledTimes(1);
        expect(harness.upsert).toHaveBeenCalledWith(DEFAULT_RULEBOOK);
        expect(harness.toastSuccess).toHaveBeenCalledWith('Rulebook saved');
    });

    it('keeps the edits in the overwrite form while a failed save refetches the invalid rulebook', async () => {
        harness.rulebookQuery = failed(invalidStoredRulebookError());
        harness.upsert.mockImplementationOnce(() =>
            Promise.reject(new Error('Too many requests')),
        );
        render();
        click(requireButton(container, 'Overwrite with a new rulebook'));
        const input = fundedRiskInput();
        if (input === null) throw new Error('no funded risk input');
        typeInto(input, '175');

        await act(async () => {
            requireButton(container, 'Save rulebook').click();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(harness.toastError).toHaveBeenCalledWith('Too many requests');

        harness.rulebookQuery = {
            data: undefined,
            error: null,
            isError: false,
            isPending: true,
            isSuccess: false,
        };
        render();
        harness.rulebookQuery = failed(invalidStoredRulebookError());
        render();

        expect(fundedRiskInput()?.value).toBe('175');
        expect(buttonIn(container, 'Overwrite with a new rulebook')).toBe(
            undefined,
        );
    });

    it('shows the saved rulebook once the overwrite is stored and the query reads it back', () => {
        harness.rulebookQuery = failed(invalidStoredRulebookError());
        render();
        click(requireButton(container, 'Overwrite with a new rulebook'));

        harness.rulebookQuery = answered({
            ...DEFAULT_RULEBOOK,
            funded: { ...DEFAULT_RULEBOOK.funded, riskCents: 30_000 },
        });
        render();

        expect(fundedRiskInput()?.value).toBe('300');
        expect(container.textContent).not.toContain(
            'Saving replaces your stored rulebook',
        );
    });

    it('keeps the stored rulebook and the edits when a refetch fails after an overwrite was stored and read back', async () => {
        const saved = {
            ...DEFAULT_RULEBOOK,
            funded: { ...DEFAULT_RULEBOOK.funded, riskCents: 30_000 },
        };
        harness.rulebookQuery = failed(invalidStoredRulebookError());
        render();
        click(requireButton(container, 'Overwrite with a new rulebook'));
        harness.rulebookQuery = answered(saved);
        render();
        const input = fundedRiskInput();
        if (input === null) throw new Error('no funded risk input');
        typeInto(input, '175');
        harness.upsert.mockImplementationOnce(() =>
            Promise.reject(new Error('Failed to fetch')),
        );

        await act(async () => {
            requireButton(container, 'Save rulebook').click();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        harness.rulebookQuery = {
            data: saved,
            error: new Error('Failed to fetch'),
            isError: true,
            isPending: false,
            isSuccess: false,
        };
        render();

        expect(fundedRiskInput()?.value).toBe('175');
        expect(container.textContent).not.toContain(
            'Saving replaces your stored rulebook',
        );
        expect(container.textContent).not.toContain(
            'Starting from the skill defaults',
        );
    });

    it('keeps the loaded rulebook form when a background refetch fails with the data kept', () => {
        harness.rulebookQuery = answered(DEFAULT_RULEBOOK);
        render();
        const input = fundedRiskInput();
        if (input === null) throw new Error('no funded risk input');
        typeInto(input, '175');

        harness.rulebookQuery = {
            data: DEFAULT_RULEBOOK,
            error: new Error('Failed to fetch'),
            isError: true,
            isPending: false,
            isSuccess: false,
        };
        render();

        expect(fundedRiskInput()?.value).toBe('175');
        expect(container.textContent).not.toContain(
            'The rulebook could not be loaded',
        );
    });

    it('leaves overwrite mode once a rulebook is read, so a later refetch from an empty cache never reopens the defaults form', () => {
        harness.rulebookQuery = failed(invalidStoredRulebookError());
        render();
        click(requireButton(container, 'Overwrite with a new rulebook'));
        harness.rulebookQuery = answered(DEFAULT_RULEBOOK);
        render();

        harness.rulebookQuery = {
            data: undefined,
            error: null,
            isError: false,
            isPending: true,
            isSuccess: false,
        };
        render();

        expect(container.textContent).not.toContain(
            'Saving replaces your stored rulebook',
        );
        expect(fundedRiskInput()).toBeNull();
    });

    it('drops the overwrite form for the load error when the refetch fails for another reason before any rulebook was read', () => {
        harness.rulebookQuery = failed(invalidStoredRulebookError());
        render();
        click(requireButton(container, 'Overwrite with a new rulebook'));

        harness.rulebookQuery = failed(new Error('Failed to fetch'));
        render();

        expect(container.textContent).toContain(
            'The rulebook could not be loaded',
        );
        expect(container.textContent).not.toContain(
            'Saving replaces your stored rulebook',
        );
        expect(fundedRiskInput()).toBeNull();
    });

    it('shows only the error, with no repair actions, when the rulebook fails for another reason', () => {
        harness.rulebookQuery = failed(new Error('Failed to fetch'));
        render();

        expect(container.textContent).toContain(
            'The rulebook could not be loaded',
        );
        expect(container.textContent).toContain('Failed to fetch');
        expect(buttonIn(container, 'Reset to skill defaults')).toBeUndefined();
        expect(
            buttonIn(container, 'Overwrite with a new rulebook'),
        ).toBeUndefined();
        expect(fundedRiskInput()).toBeNull();
    });
});
