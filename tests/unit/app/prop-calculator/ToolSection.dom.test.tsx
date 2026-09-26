import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToolSection } from '~/app/(app)/prop-calculator/_components/ToolSection';
import { FirmId } from '~/lib/prop-calculator';
import { LegacySection } from '~/lib/site/legacyCalculatorLinks';

describe('ToolSection', () => {
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
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    function renderedSection(): HTMLElement {
        const section = container.querySelector('section');
        if (section === null) throw new Error('no section rendered');
        return section;
    }

    it.each([LegacySection.TailRisk, `rules-${FirmId.Apex}` as const])(
        'renders section %s with its id, section class, scroll margin and a labelling h2',
        (id) => {
            act(() => {
                root.render(
                    <ToolSection id={id} title="Section title">
                        <p>body</p>
                    </ToolSection>,
                );
            });
            const section = renderedSection();
            const heading = section.querySelector(':scope > h2');
            expect(section.id).toBe(id);
            expect(
                section.classList.contains(
                    `app-prop-calculator__section-${id}`,
                ),
            ).toBe(true);
            expect(section.classList.contains('scroll-mt-26')).toBe(true);
            expect(heading?.id).toBe(`${id}-heading`);
            expect(heading?.textContent).toBe('Section title');
            expect(heading?.classList.contains('sr-only')).toBe(false);
            expect(section.getAttribute('aria-labelledby')).toBe(heading?.id);
            expect(section.querySelector(':scope > p')?.textContent).toBe(
                'body',
            );
        },
    );

    it('hides the h2 visually but keeps it as the label when srOnlyHeading is set', () => {
        act(() => {
            root.render(
                <ToolSection
                    id={LegacySection.Simulator}
                    srOnlyHeading
                    title="Hidden"
                >
                    <p>body</p>
                </ToolSection>,
            );
        });
        const section = renderedSection();
        const heading = section.querySelector(':scope > h2');
        expect(heading?.classList.contains('sr-only')).toBe(true);
        expect(section.getAttribute('aria-labelledby')).toBe(heading?.id);
    });

    it('appends a caller className to the section classes', () => {
        act(() => {
            root.render(
                <ToolSection
                    className="extra-class"
                    id={LegacySection.Charts}
                    title="Charts"
                >
                    <p>body</p>
                </ToolSection>,
            );
        });
        const section = renderedSection();
        expect(section.classList.contains('extra-class')).toBe(true);
        expect(
            section.classList.contains('app-prop-calculator__section-charts'),
        ).toBe(true);
    });
});
