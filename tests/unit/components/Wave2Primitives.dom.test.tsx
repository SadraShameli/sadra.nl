import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FilterToolbar } from '~/components/FilterToolbar';
import { InfoNote } from '~/components/InfoNote';
import { PanelSubheading } from '~/components/PanelSubheading';
import { ToolPanel } from '~/components/ToolPanel';
import { Badge } from '~/components/ui/badge';

describe('the shared explainer, heading, toolbar and badge pieces', () => {
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
        vi.unstubAllGlobals();
    });

    it('puts panel methodology behind an info button beside the title', () => {
        act(() => {
            root.render(
                <ToolPanel info="How the cushion is measured." title="Cushion">
                    body
                </ToolPanel>,
            );
        });
        expect(
            container.querySelector(
                ':scope button[aria-label="About Cushion"]',
            ),
        ).not.toBeNull();
        expect(container.textContent).not.toContain('How the cushion');
    });

    it('shows one muted line with its method behind an info button', () => {
        act(() => {
            root.render(
                <InfoNote
                    info="Drift needs two standard errors."
                    infoTitle="How drift is flagged"
                >
                    Read only: journal numbers never change your rulebook.
                </InfoNote>,
            );
        });
        expect(container.textContent).toBe(
            'Read only: journal numbers never change your rulebook.',
        );
        expect(
            container.querySelector(
                ':scope button[aria-label="About How drift is flagged"]',
            ),
        ).not.toBeNull();
    });

    it('marks a sub-section inside a panel as an h3 by default', () => {
        act(() => {
            root.render(<PanelSubheading>Costs by firm</PanelSubheading>);
        });
        expect(container.querySelector(':scope h3')?.textContent).toBe(
            'Costs by firm',
        );
    });

    it('groups filters in one labelled row in the order given', () => {
        act(() => {
            root.render(
                <FilterToolbar label="Filter assessments">
                    <button type="button">Grade</button>
                    <button type="button">Clear</button>
                </FilterToolbar>,
            );
        });
        const group = container.querySelector(':scope [role="group"]');
        expect(group?.getAttribute('aria-label')).toBe('Filter assessments');
        expect(group?.textContent).toBe('GradeClear');
    });

    it('draws a badge as a neutral outline by default', () => {
        act(() => {
            root.render(<Badge>Unverified</Badge>);
        });
        expect(container.querySelector(':scope span')?.className).toContain(
            'border-line-strong',
        );
    });
});
