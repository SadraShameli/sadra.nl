import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CheckboxCard } from '~/app/(app)/trade-checklist/_components/WizardFields';

const mounted: { container: HTMLDivElement; root: Root }[] = [];

function checkboxIn(container: HTMLElement): HTMLButtonElement | null {
    return container.querySelector<HTMLButtonElement>('[role="checkbox"]');
}

function render(): HTMLDivElement {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    mounted.push({ container, root });
    act(() => {
        root.render(<StatefulCheckboxCard />);
    });
    return container;
}

function StatefulCheckboxCard() {
    const [isChecked, setIsChecked] = useState(false);
    return (
        <CheckboxCard
            checked={isChecked}
            description="SL is at a defined swing high or low."
            id="sl-swing"
            label="Stop at clear swing point"
            onCheckedChange={setIsChecked}
        />
    );
}

describe('the wizard checkbox card', () => {
    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    });

    afterEach(() => {
        for (const { container, root } of mounted.splice(0)) {
            act(() => root.unmount());
            container.remove();
        }
        vi.unstubAllGlobals();
    });

    it('checks when its description is clicked', () => {
        const container = render();
        const description = container.querySelector<HTMLElement>(
            '[data-slot="field-description"]',
        );
        act(() => description?.click());
        expect(checkboxIn(container)?.getAttribute('aria-checked')).toBe(
            'true',
        );
    });

    it('unchecks on a second click', () => {
        const container = render();
        act(() => checkboxIn(container)?.click());
        act(() => checkboxIn(container)?.click());
        expect(checkboxIn(container)?.getAttribute('aria-checked')).toBe(
            'false',
        );
    });
});
