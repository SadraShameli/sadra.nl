import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RulesView } from '~/app/(app)/prop-calculator/(tools)/rules/RulesView';
import {
    toolCatalogEntry,
    ToolId,
} from '~/app/(app)/prop-calculator/_components/toolCatalog';
import {
    ALL_FIRMS,
    type Plan,
    PLAN_AVAILABILITY_LABEL,
} from '~/lib/prop-calculator';
import {
    describePlanRules,
    PLAN_RULE_SEGMENT_LABEL,
} from '~/lib/prop-calculator/describe';

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorToolbar', () => ({
    CalculatorToolbar: () => (
        <button className="calculator-toolbar-under-test" type="button">
            share
        </button>
    ),
}));

function registryPlans(): Plan[] {
    return ALL_FIRMS.flatMap((firm) => [...firm.plans]);
}

function textsOf(elements: Iterable<Element>): string[] {
    return [...elements].map((element) => element.textContent);
}

describe('RulesView', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(<RulesView />);
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('renders one h1 with the Rules catalog label', () => {
        expect(textsOf(container.querySelectorAll('h1'))).toEqual([
            toolCatalogEntry(ToolId.Rules).label,
        ]);
    });

    it('renders one labelled section and h2 per firm, in registry order', () => {
        const sections = [...container.querySelectorAll('section')];
        expect(sections.map((section) => section.id)).toEqual(
            ALL_FIRMS.map((firm) => `rules-${firm.id}`),
        );
        for (const [index, section] of sections.entries()) {
            const firm = ALL_FIRMS[index];
            const heading = section.querySelector(':scope > h2');
            expect(heading?.textContent).toBe(firm?.displayName);
            expect(section.getAttribute('aria-labelledby')).toBe(heading?.id);
            expect(
                section.classList.contains(
                    `app-prop-calculator__section-${section.id}`,
                ),
            ).toBe(true);
        }
        expect(container.querySelectorAll('h2')).toHaveLength(ALL_FIRMS.length);
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

    it('renders one h3 and one definition list per plan', () => {
        const planCount = registryPlans().length;
        expect(container.querySelectorAll('article')).toHaveLength(planCount);
        expect(container.querySelectorAll(':scope article > h3')).toHaveLength(
            planCount,
        );
        expect(container.querySelectorAll(':scope article > dl')).toHaveLength(
            planCount,
        );
    });

    it('lists every describePlanRules segment of every plan as a dt and dd pair', () => {
        const articles = [...container.querySelectorAll('article')];
        for (const [index, plan] of registryPlans().entries()) {
            const segments = describePlanRules(plan).flat();
            const list = articles[index]?.querySelector('dl');
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
            ).toEqual(segments.map((segment) => segment.value));
        }
    });

    it('marks only the non-purchasable plans with the CLI availability label', () => {
        const headings = textsOf(
            container.querySelectorAll(':scope article > h3'),
        );
        const plans = registryPlans();
        expect(plans.some((plan) => !plan.isPurchasable)).toBe(true);
        for (const [index, plan] of plans.entries()) {
            expect(headings[index]).toBe(
                plan.isPurchasable
                    ? plan.label
                    : `${plan.label}[${PLAN_AVAILABILITY_LABEL[plan.availability]}]`,
            );
        }
    });

    it('renders no share toolbar, button or link', () => {
        expect(toolCatalogEntry(ToolId.Rules).sharesState).toBe(false);
        expect(
            container.querySelector('.calculator-toolbar-under-test'),
        ).toBeNull();
        expect(container.querySelectorAll('button')).toHaveLength(0);
        expect(container.querySelectorAll('a')).toHaveLength(0);
    });
});
