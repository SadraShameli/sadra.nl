import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { assessmentLabel } from '~/app/(app)/trade-checklist/_components/AssessmentBadges';
import { JournalView } from '~/app/(app)/trade-checklist/_components/JournalView';

import { chooseRowAction } from '../../components/rowActionsMenu';
import { assessment } from './assessmentFixture';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

describe('the journal assessments table', () => {
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

    it('titles each assessment card with its grade and opens it from the row menu', () => {
        const row = assessment();
        act(() => {
            root.render(
                <JournalView
                    history={[row]}
                    plans={[{ id: 'old-plan', name: 'Old plan' }]}
                />,
            );
        });
        expect(
            container.querySelector(':scope tbody th[scope="row"]')
                ?.textContent,
        ).toBe(row.grade);
        expect(document.body.querySelector('[role="dialog"]')).toBeNull();
        chooseRowAction(assessmentLabel(row), 'View');
        expect(
            document.body.querySelector(':scope [role="dialog"]')?.textContent,
        ).toContain(`${row.score.toFixed(1)} / 100`);
    });
});
