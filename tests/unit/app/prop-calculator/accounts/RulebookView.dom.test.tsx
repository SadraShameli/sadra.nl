import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    type TradingPlanSource,
    TradingPlanSourceKind,
} from '~/app/(app)/prop-calculator/accounts/rulebook/rulebookFromTradingPlan';
import { RulebookView } from '~/app/(app)/prop-calculator/accounts/rulebook/RulebookView';
import { LiveTransferRateUnavailable } from '~/lib/prop-accounts/firms';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import { fraction, TRADING_DAYS_PER_MONTH } from '~/lib/prop-calculator/core';
import {
    compoundedMultiple,
    kellyGrowthPerTrade,
} from '~/lib/prop-calculator/economics';
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
        measured: {},
        measuredStatus: { failed: false, pending: false },
        reset: vi.fn(() => Promise.resolve({ ok: true })),
        rulebookQuery,
        toastError: vi.fn(),
        toastSuccess: vi.fn(),
        unavailable: {},
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

vi.mock(
    '~/app/(app)/prop-calculator/accounts/rulebook/useMeasuredHazards',
    () => ({
        useMeasuredHazards: () => ({
            ...harness.measuredStatus,
            measured: harness.measured,
            unavailable: harness.unavailable,
        }),
    }),
);

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
        expect(harness.upsert).toHaveBeenCalledWith({
            ...DEFAULT_RULEBOOK,
            samples: { ...DEFAULT_RULEBOOK.samples, minEndedAccounts: null },
        });
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

describe('RulebookView v2 sections', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.rulebookQuery = answered(DEFAULT_RULEBOOK);
        harness.upsert.mockClear();
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

    function labelled(label: string): HTMLLabelElement {
        const element = [...container.querySelectorAll('label')].find(
            (candidate) => candidate.textContent.startsWith(label),
        );
        if (element === undefined) throw new Error(`no label ${label}`);
        return element;
    }

    function inputLabelled(label: string): HTMLInputElement {
        const input = container.querySelector(
            `#${CSS.escape(labelled(label).htmlFor)}`,
        );
        if (!(input instanceof HTMLInputElement)) {
            throw new TypeError(`no input labelled ${label}`);
        }
        return input;
    }

    function itemOf(label: string): HTMLElement {
        const item = labelled(label).parentElement;
        if (item === null) {
            throw new TypeError(`no form item for ${label}`);
        }
        return item;
    }

    async function save() {
        await act(async () => {
            requireButton(container, 'Save rulebook').click();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
    }

    it('renders a fieldset for every v2 section', () => {
        const titles = [
            ...container.querySelectorAll('[data-slot="card-title"]'),
        ].map((title) => title.textContent);
        expect(titles).toEqual(
            expect.arrayContaining([
                'Bankroll and scaling',
                'Samples',
                'Targets',
                'Plausibility',
                'Alerts',
                'Display',
                'Live transfer (your assumption, not a firm rule)',
            ]),
        );
    });

    it('shows no plausibility note for the default 40% winrate at 1:2, a typical edge', () => {
        expect(itemOf('Win rate').textContent).not.toContain('edge:');
        const note = container.querySelector('[role="status"]');
        expect(note).not.toBeNull();
        expect(note?.textContent).toBe('');
    });

    it('flags an implausible edge live as the strategy fields change, naming the level and both entered inputs', () => {
        typeInto(inputLabelled('Win rate'), '90');
        const note = container.querySelector('[role="status"]');
        expect(note).not.toBeNull();
        expect(note?.textContent).toContain('Implausible edge');
        expect(note?.textContent).toContain('90%');
        expect(note?.textContent).toContain('1:2.00');
    });

    it('adds the full-Kelly growth and the one-month multiple at the strategy trades per day to the note (F-V22, PT-86)', () => {
        typeInto(inputLabelled('Win rate'), '90');
        const growth =
            kellyGrowthPerTrade(fraction(0.9), DEFAULT_RULEBOOK.strategy.rr)
                .value ?? NaN;
        const multiple =
            compoundedMultiple(
                growth,
                DEFAULT_RULEBOOK.strategy.tradesPerDayMax *
                    TRADING_DAYS_PER_MONTH,
            ).value ?? NaN;
        const text = container.querySelector('[role="status"]')?.textContent;
        expect(text).toContain(
            `${(Math.expm1(growth) * 100).toFixed(2)}% per trade`,
        );
        expect(text).toContain(
            `${String(DEFAULT_RULEBOOK.strategy.tradesPerDayMax)} trades per day`,
        );
        expect(text).toContain(
            `compounds to ${multiple.toLocaleString('en-US', { maximumFractionDigits: 2 })}x`,
        );
        expect(text).toContain(
            'information, not sizing; Kelly is not prop-firm sizing',
        );
    });

    it('leaves the pace sentence out while the trades per day is not a number', () => {
        typeInto(inputLabelled('Win rate'), '90');
        typeInto(inputLabelled('Trades per day'), '');
        const text = container.querySelector('[role="status"]')?.textContent;
        expect(text).toContain('Implausible edge');
        expect(text).not.toContain('compounds to');
    });

    it('follows a live-edited plausibility threshold, not just the strategy fields', () => {
        expect(container.querySelector('[role="status"]')?.textContent).toBe(
            '',
        );
        typeInto(inputLabelled('Typical edge up to'), '0.1');
        const note = container.querySelector('[role="status"]');
        expect(note).not.toBeNull();
        expect(note?.textContent).toContain('typical up to +0.10R');
    });

    it("leaves the loss-risk and sample thresholds empty, naming the video author's values only as help text", () => {
        expect(inputLabelled('Loss-risk threshold').value).toBe('');
        expect(inputLabelled('Eval attempts before').value).toBe('');
        expect(inputLabelled('Funded accounts before').value).toBe('');
        expect(itemOf('Loss-risk threshold').textContent).toContain(
            "0.5% (the video author's choice, not a default)",
        );
        expect(itemOf('Eval attempts before').textContent).toContain(
            "50 (the video author's choice, not a default)",
        );
        expect(itemOf('Loss-risk threshold').textContent).toContain(
            'Empty means not set.',
        );
    });

    it('shows the defaults that are set and the risk display unit', () => {
        expect(inputLabelled('Days between rounds').value).toBe('14');
        expect(inputLabelled('Typical edge up to').value).toBe('0.3');
        expect(inputLabelled('Strong edge up to').value).toBe('0.35');
        expect(itemOf('Show risk as').textContent).toContain('Account dollars');
        expect(inputLabelled('Highlight a next payout within').value).toBe('7');
        expect(inputLabelled('My Funded Futures').value).toBe('');
    });

    it('saves the next payout highlight window the user sets, in whole days', async () => {
        typeInto(inputLabelled('Highlight a next payout within'), '10');
        await save();

        expect(harness.upsert).toHaveBeenCalledWith({
            ...DEFAULT_RULEBOOK,
            display: {
                ...DEFAULT_RULEBOOK.display,
                nextPayoutHighlightDays: 10,
            },
        });
    });

    it('saves the thresholds and firm hazards the user sets, as fractions', async () => {
        typeInto(inputLabelled('Loss-risk threshold'), '0.5');
        typeInto(inputLabelled('Eval attempts before'), '50');
        typeInto(inputLabelled('My Funded Futures'), '10');
        await save();

        expect(harness.upsert).toHaveBeenCalledTimes(1);
        expect(harness.upsert).toHaveBeenCalledWith({
            ...DEFAULT_RULEBOOK,
            bankroll: {
                ...DEFAULT_RULEBOOK.bankroll,
                lossRiskThreshold: 0.005,
            },
            liveTransfer: { hazardPerPaidPayoutByFirm: { mffu: 0.1 } },
            samples: {
                ...DEFAULT_RULEBOOK.samples,
                minEndedAccounts: null,
                minEvalAttempts: 50,
            },
        });
    });

    it('round-trips the ended-accounts threshold, saving a blank field as null', async () => {
        expect(inputLabelled('Ended accounts before').value).toBe('');
        expect(itemOf('Ended accounts before').textContent).toContain(
            'funded-accounts threshold',
        );
        typeInto(inputLabelled('Ended accounts before'), '25');
        await save();

        expect(harness.upsert).toHaveBeenCalledWith({
            ...DEFAULT_RULEBOOK,
            samples: { ...DEFAULT_RULEBOOK.samples, minEndedAccounts: 25 },
        });
    });

    it('blocks a 100% firm hazard and states the bound in percent', async () => {
        typeInto(inputLabelled('My Funded Futures'), '100');
        await save();

        expect(harness.upsert).not.toHaveBeenCalled();
        expect(itemOf('My Funded Futures').textContent).toContain(
            'Enter a percentage below 100%',
        );
    });

    it('keeps the documented rule label when only v2 fields change', () => {
        typeInto(inputLabelled('Typical edge up to'), '0.2');
        typeInto(inputLabelled('Accounts you can trade per day'), '8');
        expect(container.textContent).toContain('Matches the skill');
        expect(container.textContent).toContain('your documented rule');
    });

    it('blocks a save with an inverted plausibility pair on the typical field', async () => {
        typeInto(inputLabelled('Typical edge up to'), '0.5');
        await save();

        expect(harness.upsert).not.toHaveBeenCalled();
        expect(itemOf('Typical edge up to').textContent).toContain(
            'must not exceed the strong one',
        );
    });
});

describe('RulebookView measured live-transfer rates (PT-73, F-V26)', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.rulebookQuery = answered(DEFAULT_RULEBOOK);
        harness.measured = {};
        harness.measuredStatus = { failed: false, pending: false };
        harness.unavailable = {};
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
        harness.measured = {};
        harness.measuredStatus = { failed: false, pending: false };
        harness.unavailable = {};
    });

    function render() {
        act(() => {
            root.render(<RulebookView tradingPlan={READY_PLAN} />);
        });
    }

    function hazardItem(label: string): HTMLElement {
        const labelElement = [...container.querySelectorAll('label')].find(
            (candidate) => candidate.textContent.startsWith(label),
        );
        const item = labelElement?.parentElement;
        if (item === null || item === undefined) {
            throw new TypeError(`no form item for ${label}`);
        }
        return item;
    }

    it('shows no measured line while nothing was measured', () => {
        render();
        expect(container.textContent).not.toContain('Measured:');
    });

    it('shows the measured rate with its counts under the firm field and offers it as a prefill', () => {
        harness.measured = {
            mffu: {
                movedLiveCount: 3,
                paidPayouts: 20,
                rate: 0.15,
                suggestedText: '15',
            },
        };
        render();
        const item = hazardItem('My Funded Futures');
        expect(item.textContent).toContain(
            'Measured: 15.0% per paid payout (3 sent live in 20 paid payouts)',
        );
        expect(buttonIn(item, 'Use 15%')).toBeDefined();
    });

    it('fills the field with the measured rate only when the user asks, and leaves it empty before', () => {
        harness.measured = {
            mffu: {
                movedLiveCount: 3,
                paidPayouts: 20,
                rate: 0.15,
                suggestedText: '15',
            },
        };
        render();
        const input = (): HTMLInputElement => {
            const found =
                hazardItem('My Funded Futures').querySelector('input');
            if (found === null) throw new TypeError('no hazard input');
            return found;
        };
        expect(input().value).toBe('');
        click(requireButton(hazardItem('My Funded Futures'), 'Use 15%'));
        expect(input().value).toBe('15');
    });

    it('shows a firm with no transfers seen but offers no prefill, since 0 is not accepted', () => {
        harness.measured = {
            mffu: {
                movedLiveCount: 0,
                paidPayouts: 12,
                rate: 0,
                suggestedText: null,
            },
        };
        render();
        const item = hazardItem('My Funded Futures');
        expect(item.textContent).toContain(
            'Measured: 0.0% per paid payout (0 sent live in 12 paid payouts)',
        );
        expect(item.querySelector('button')).toBeNull();
    });

    it('says the measurement is history, not a firm rule', () => {
        harness.measured = {
            mffu: {
                movedLiveCount: 3,
                paidPayouts: 20,
                rate: 0.15,
                suggestedText: '15',
            },
        };
        render();
        expect(hazardItem('My Funded Futures').textContent).toContain(
            'from your own ledger',
        );
    });

    it('names the firm on each prefill button so assistive technology can tell them apart', () => {
        const measured = {
            movedLiveCount: 3,
            paidPayouts: 20,
            rate: 0.15,
            suggestedText: '15',
        };
        harness.measured = { apex: measured, mffu: measured };
        render();
        const labels = [...container.querySelectorAll('button')]
            .map((button) => button.getAttribute('aria-label'))
            .filter((label) => label?.startsWith('Use 15%'));
        expect(labels).toHaveLength(2);
        expect(new Set(labels).size).toBe(2);
        expect(
            requireButton(
                hazardItem('My Funded Futures'),
                'Use 15%',
            ).getAttribute('aria-label'),
        ).toBe('Use 15% for My Funded Futures');
    });

    it('says a hazard entered for a firm is applied to every simulation built from the rulebook for that firm', () => {
        render();
        const text = container.textContent;
        expect(text).toContain(
            "applied to every simulation built from your rulebook for that firm's accounts",
        );
        expect(text).toContain("the advisor's account value runs");
        expect(text).toContain(
            'the payout planner and its withdrawal-size table',
        );
        expect(text).toContain(
            'the overview projections and next-payout figures',
        );
        expect(text).toContain('retire comparisons, risk candidates');
        expect(text).toContain('copy-group runs');
        expect(text).toContain('A firm with no rate is priced with none');
        expect(text).not.toContain('not yet used by any calculation');
        expect(text).not.toContain('keep its transfers unpriced');
    });

    it('says only the advisor run note states the hazard beside its figures, so the other surfaces do not hide it', () => {
        render();
        expect(container.textContent).toContain(
            "Only the advisor's run note states it beside its figures; the other surfaces apply it without repeating it",
        );
    });

    it('says the measured rates are unavailable when the ledger could not be loaded', () => {
        harness.measuredStatus = { failed: true, pending: false };
        render();
        expect(container.textContent).toContain(
            'Measured rates unavailable: your ledger could not be loaded',
        );
    });

    it('says the measured rates are loading while the ledger is read', () => {
        harness.measuredStatus = { failed: false, pending: true };
        render();
        expect(container.textContent).toContain('Loading your measured rates');
        expect(container.textContent).not.toContain(
            'Measured rates unavailable',
        );
    });

    it('says why a firm has no measured rate under that firm only', () => {
        harness.unavailable = {
            mffu: {
                reason: LiveTransferRateUnavailable.MoreTransfersThanPayouts,
                text: '2 transfers against 1 paid payout',
            },
        };
        render();
        expect(hazardItem('My Funded Futures').textContent).toContain(
            'n/a: 2 transfers against 1 paid payout',
        );
        expect(hazardItem('Apex').textContent).not.toContain('n/a:');
        expect(container.textContent).not.toContain(
            'Measured rates unavailable',
        );
    });

    it('shows no n/a line when every rate was measured', () => {
        render();
        expect(container.textContent).not.toContain('n/a:');
    });

    it('discloses how many measured transfers are accounts recorded straight at Live', () => {
        harness.measured = {
            mffu: {
                movedLiveCount: 3,
                paidPayouts: 20,
                rate: 0.15,
                recordedAtLiveCount: 2,
                suggestedText: '15',
            },
        };
        render();
        expect(hazardItem('My Funded Futures').textContent).toContain(
            'includes 2 accounts recorded straight at Live',
        );
    });

    it('says nothing about accounts recorded straight at Live when there are none', () => {
        harness.measured = {
            mffu: {
                movedLiveCount: 3,
                paidPayouts: 20,
                rate: 0.15,
                recordedAtLiveCount: 0,
                suggestedText: '15',
            },
        };
        render();
        expect(container.textContent).not.toContain('straight at Live');
    });

    it('shows neither notice when the rates were read', () => {
        render();
        expect(container.textContent).not.toContain(
            'Loading your measured rates',
        );
        expect(container.textContent).not.toContain(
            'Measured rates unavailable',
        );
    });
});
