import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    type TradingPlanSource,
    TradingPlanSourceKind,
} from '~/app/(app)/prop-calculator/accounts/rulebook/rulebookFromTradingPlan';
import { RulebookView } from '~/app/(app)/prop-calculator/accounts/rulebook/RulebookView';
import {
    DEFAULT_RULEBOOK,
    documentedRuleLabel,
    type RulebookParameters,
    RuleSource,
} from '~/lib/prop-calculator/advisor';
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
        isPending: false,
        isSuccess: true,
    };
    return { rulebookQuery };
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
                        mutateAsync: vi.fn(),
                    }),
                },
                upsert: {
                    useMutation: () => ({
                        isPending: false,
                        mutateAsync: vi.fn(),
                    }),
                },
            },
        },
        useUtils: () => ({
            propAccounts: { invalidate: vi.fn(() => Promise.resolve()) },
        }),
    },
}));

vi.mock(
    '~/app/(app)/prop-calculator/accounts/rulebook/useMeasuredHazards',
    () => ({
        useMeasuredHazards: () => ({
            failed: false,
            measured: {},
            pending: false,
            unavailable: {},
        }),
    }),
);

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const DEVIATING_RULEBOOK: RulebookParameters = {
    ...DEFAULT_RULEBOOK,
    execution: { maxTradesPerWindow: 2 },
    funded: {
        ...DEFAULT_RULEBOOK.funded,
        riskCents: 30_000,
        takeProfitCents: 60_000,
    },
};

function planWith(
    fundedDollars: number,
    maxTradesPerWindow: number,
): TradingPlanSource {
    return {
        kind: TradingPlanSourceKind.Ready,
        name: 'My trading plan',
        risk: { ...DEFAULT_PLAN.risk, fundedDollars, maxTradesPerWindow },
    };
}

const PLAN_AT_DEFAULTS = planWith(250, 1);

const PLAN_OFF_DEFAULTS = planWith(200, 2);

function stored(rulebook: RulebookParameters) {
    harness.rulebookQuery = {
        data: rulebook,
        error: null,
        isError: false,
        isPending: false,
        isSuccess: true,
    };
}

describe('the rulebook deviation card and import preview (F-144)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(tradingPlan: TradingPlanSource) {
        act(() => {
            root.render(<RulebookView tradingPlan={tradingPlan} />);
        });
    }

    function deviationCard(): HTMLElement {
        const title = [...container.querySelectorAll('*')].find(
            (candidate) =>
                candidate.children.length === 0 &&
                candidate.textContent.trim() === 'Deviations from the skill',
        );
        const card = title?.parentElement?.parentElement;
        if (!(card instanceof HTMLElement)) {
            throw new TypeError('no deviation card');
        }
        return card;
    }

    function previewRegion(): HTMLElement {
        const region = container.querySelector<HTMLElement>(
            '[role="region"][aria-label="Import preview"]',
        );
        if (region === null) throw new Error('no preview region');
        return region;
    }

    function openPreview() {
        const toggle = [...container.querySelectorAll('button')].find(
            (button) => button.textContent.trim() === 'Preview import',
        );
        if (toggle === undefined) throw new Error('no preview toggle');
        act(() => {
            toggle.focus();
            toggle.click();
        });
    }

    function previewParagraph(prefix: string): string | undefined {
        return [...previewRegion().querySelectorAll('p')]
            .map((paragraph) => paragraph.textContent.trim())
            .find((text) => text.startsWith(prefix));
    }

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
        vi.unstubAllGlobals();
    });

    it('shows the custom headline preview and one badge per deviating source, and the preview lists what an import brings back in line', () => {
        stored(DEVIATING_RULEBOOK);
        render(PLAN_AT_DEFAULTS);
        const card = deviationCard();
        const sources = [RuleSource.HardRule5, RuleSource.HardRule6];
        expect(card.textContent).toContain(
            `Headline label preview: \u{201C}${documentedRuleLabel(sources)}\u{201D}.`,
        );
        expect(card.textContent).toContain(
            'your custom rule (differs from Hard Rule 5, Hard Rule 6)',
        );
        expect(
            [...card.querySelectorAll('li')].map((item) =>
                item.textContent.trim(),
            ),
        ).toEqual(['Hard Rule 5', 'Hard Rule 6']);
        expect(card.textContent).not.toContain('Matches the skill');

        openPreview();
        expect(previewParagraph('Back in line with the skill')).toBe(
            'Back in line with the skill: Hard Rule 5, Hard Rule 6.',
        );
        expect(previewParagraph('New deviations')).toBeUndefined();
        expect(previewRegion().textContent).toContain(
            `Headline label preview after the import: \u{201C}${documentedRuleLabel([])}\u{201D}.`,
        );
    });

    it('says the rulebook matches the skill, and the preview lists the new deviations an import would add', () => {
        stored(DEFAULT_RULEBOOK);
        render(PLAN_OFF_DEFAULTS);
        const card = deviationCard();
        expect(card.textContent).toContain('Matches the skill');
        expect(card.textContent).toContain(
            `\u{201C}${documentedRuleLabel([])}\u{201D}`,
        );
        expect(card.querySelectorAll('li')).toHaveLength(0);

        openPreview();
        expect(previewParagraph('New deviations from the skill')).toBe(
            'New deviations from the skill: Hard Rule 5, Hard Rule 6.',
        );
        expect(previewParagraph('Back in line')).toBeUndefined();
        expect(previewRegion().textContent).toContain(
            `Headline label preview after the import: \u{201C}${documentedRuleLabel([RuleSource.HardRule5, RuleSource.HardRule6])}\u{201D}.`,
        );
    });

    it('shows both paragraphs when an import adds one deviation and clears another', () => {
        stored({
            ...DEFAULT_RULEBOOK,
            execution: { maxTradesPerWindow: 2 },
        });
        render(planWith(200, 1));
        expect(deviationCard().textContent).toContain(
            'your custom rule (differs from Hard Rule 6)',
        );
        openPreview();
        expect(previewParagraph('New deviations from the skill')).toBe(
            'New deviations from the skill: Hard Rule 5.',
        );
        expect(previewParagraph('Back in line with the skill')).toBe(
            'Back in line with the skill: Hard Rule 6.',
        );
    });
});
