import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    RulesUrlParameter,
    RulesView,
} from '~/app/(app)/prop-calculator/(tools)/rules/RulesView';
import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    toolCatalogEntry,
    ToolId,
} from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { NOT_APPLICABLE } from '~/lib/format';
import {
    ALL_FIRMS,
    PLAN_AVAILABILITY_LABEL,
    type TradingFirm,
} from '~/lib/prop-calculator';
import {
    describePlanRules,
    PLAN_RULE_SEGMENT_LABEL,
} from '~/lib/prop-calculator/describe';

import {
    MISSING_REASON_BUTTON_SELECTOR,
    missingValueText,
} from './missingValue';

const navigation = vi.hoisted(() => ({
    query: '',
    replace: vi.fn<(href: string) => void>(),
}));

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/rules',
    useRouter: () => ({ replace: navigation.replace }),
    useSearchParams: () => new URLSearchParams(navigation.query),
}));

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    useCalculatorInputs: () => ({ debouncedQuery: '' }),
}));

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorToolbar', () => ({
    CalculatorToolbar: () => (
        <button className="calculator-toolbar-under-test" type="button">
            share
        </button>
    ),
}));

function firmNamed(isMatch: (firm: TradingFirm) => boolean): TradingFirm {
    const firm = ALL_FIRMS.find((candidate) => isMatch(candidate));
    if (firm === undefined) throw new Error('no firm matches');
    return firm;
}

function textsOf(elements: Iterable<Element>): string[] {
    return [...elements].map((element) => element.textContent);
}

describe('RulesView', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(query = '') {
        navigation.query = query;
        act(() => {
            root.render(<RulesView />);
        });
    }

    function shownSections(): HTMLElement[] {
        return [...container.querySelectorAll<HTMLElement>('section')];
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        navigation.replace.mockClear();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('renders one h1 with the Rules catalog label', () => {
        render();
        expect(textsOf(container.querySelectorAll('h1'))).toEqual([
            toolCatalogEntry(ToolId.Rules).label,
        ]);
    });

    it('offers one tab per firm, in registry order, named after the firm', () => {
        render();
        expect(textsOf(container.querySelectorAll('[role="tab"]'))).toEqual(
            ALL_FIRMS.map((firm) => firm.displayName),
        );
    });

    it('shows one firm at a time, the calculator default firm when the link names none', () => {
        render();
        const defaultFirm = defaultCalculatorState().firm;
        expect(shownSections().map((section) => section.id)).toEqual([
            `rules-${defaultFirm.id}`,
        ]);
        expect(container.querySelectorAll(':scope article')).toHaveLength(
            defaultFirm.plans.length,
        );
    });

    it('shows the firm the link names, so a firm can be shared and reloaded', () => {
        const firm = firmNamed(
            (candidate) => candidate.id !== defaultCalculatorState().firm.id,
        );
        render(`${RulesUrlParameter.Firm}=${firm.id}`);
        const [section] = shownSections();
        expect(section?.id).toBe(`rules-${firm.id}`);
        const heading = section?.querySelector(':scope > h2');
        expect(heading?.textContent).toBe(firm.displayName);
        expect(heading?.classList.contains('sr-only')).toBe(true);
        expect(section?.getAttribute('aria-labelledby')).toBe(heading?.id);
    });

    it('keeps the selected firm in the link when another tab is chosen', () => {
        render();
        const firm = firmNamed(
            (candidate) => candidate.id !== defaultCalculatorState().firm.id,
        );
        const tab = [
            ...container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
        ].find((candidate) => candidate.textContent === firm.displayName);
        if (tab === undefined) throw new Error('no tab for the firm');
        act(() => {
            tab.dispatchEvent(
                new MouseEvent('mousedown', { bubbles: true, button: 0 }),
            );
            tab.click();
        });
        const href = navigation.replace.mock.calls.at(-1)?.[0] ?? '';
        expect(
            new URLSearchParams(href.slice(1)).get(RulesUrlParameter.Firm),
        ).toBe(firm.id);
    });

    it('renders each firm section through ToolSection, with no hand-copied section or h2', () => {
        const source = readFileSync(
            path.join(
                process.cwd(),
                'src/app/(app)/prop-calculator/(tools)/rules/RulesView.tsx',
            ),
            'utf8',
        );
        expect(source).toMatch(/<ToolSection[\s>]/);
        expect(source).not.toMatch(/<section[\s>]/);
        expect(source).not.toMatch(/<h2[\s>]/);
    });

    it.each(ALL_FIRMS.map((firm) => [firm.displayName, firm] as const))(
        'lists every describePlanRules segment of every %s plan as a dt and dd pair, with a missing value for a rule that does not apply',
        (_name, firm) => {
            render(`${RulesUrlParameter.Firm}=${firm.id}`);
            const articles = [...container.querySelectorAll('article')];
            expect(articles).toHaveLength(firm.plans.length);
            for (const [index, plan] of firm.plans.entries()) {
                const segments = describePlanRules(plan).flat();
                const list = articles[index]?.querySelector('dl');
                expect(list?.classList.contains('app-detail-list')).toBe(true);
                expect(
                    textsOf(list?.querySelectorAll('dt') ?? []),
                    plan.label,
                ).toEqual(
                    segments.map(
                        (segment) => PLAN_RULE_SEGMENT_LABEL[segment.kind],
                    ),
                );
                expect(
                    textsOf(list?.querySelectorAll('dd') ?? []),
                    plan.label,
                ).toEqual(
                    segments.map((segment) =>
                        segment.value === NOT_APPLICABLE
                            ? missingValueText()
                            : segment.value,
                    ),
                );
            }
            expect(container.textContent).not.toContain('n/a');
        },
    );

    it.each(ALL_FIRMS.map((firm) => [firm.displayName, firm] as const))(
        'marks only the non-purchasable %s plans with the CLI availability label',
        (_name, firm) => {
            render(`${RulesUrlParameter.Firm}=${firm.id}`);
            const headings = textsOf(
                container.querySelectorAll(':scope article h3'),
            );
            for (const [index, plan] of firm.plans.entries()) {
                expect(headings[index]).toBe(
                    plan.isPurchasable
                        ? plan.label
                        : `${plan.label}${PLAN_AVAILABILITY_LABEL[plan.availability]}`,
                );
            }
        },
    );

    it('lets a lone or last odd plan card span the whole row on desktop', () => {
        const firm = firmNamed((candidate) => candidate.plans.length === 1);
        render(`${RulesUrlParameter.Firm}=${firm.id}`);
        const grid = container.querySelector('article')?.parentElement;
        expect(grid?.classList.contains('lg:grid-cols-2')).toBe(true);
        expect(
            grid?.classList.contains(
                'lg:[&>*:last-child:nth-child(odd)]:col-span-2',
            ),
        ).toBe(true);
    });

    it('renders no share toolbar, and the rules hold no links, only the firm tabs and missing-value reasons as buttons', () => {
        render();
        expect(toolCatalogEntry(ToolId.Rules).sharesState).toBe(false);
        expect(
            container.querySelector('.calculator-toolbar-under-test'),
        ).toBeNull();
        const rules = container.querySelector('.app-prop-calculator__rules');
        expect(rules).not.toBeNull();
        expect(rules?.querySelectorAll('a')).toHaveLength(0);
        const otherButtons =
            rules?.querySelectorAll('button:not([role="tab"])') ?? [];
        for (const button of otherButtons) {
            expect(button.matches(MISSING_REASON_BUTTON_SELECTOR)).toBe(true);
        }
    });
});
