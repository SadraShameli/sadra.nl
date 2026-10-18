import { act, type ReactElement } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HistoryPanel } from '~/app/(app)/trade-checklist/_components/HistoryPanel';
import { JournalView } from '~/app/(app)/trade-checklist/_components/JournalView';

import { assessment } from './assessmentFixture';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

const CREATED_AT = new Date('2026-10-18T07:58:00Z');

const SERVER_NOW = new Date('2026-10-18T15:58:00Z');

const CLIENT_NOW = new Date('2026-10-18T16:58:00Z');

const ROW = assessment({ createdAt: CREATED_AT });

describe('relative assessment times', () => {
    let container: HTMLDivElement;
    let root: null | Root = null;

    function hydrateAnHourLater(element: ReactElement): unknown[] {
        vi.setSystemTime(SERVER_NOW);
        container.innerHTML = renderToString(element);
        vi.setSystemTime(CLIENT_NOW);
        const errors: unknown[] = [];
        act(() => {
            root = hydrateRoot(container, element, {
                onRecoverableError: (error) => {
                    errors.push(error);
                },
            });
        });
        return errors;
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        vi.useFakeTimers({ toFake: ['Date'] });
        container = document.createElement('div');
        document.body.append(container);
    });

    afterEach(() => {
        act(() => {
            root?.unmount();
        });
        root = null;
        document.body.replaceChildren();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('hydrates the journal table without a mismatch when the page was rendered an hour earlier', () => {
        const errors = hydrateAnHourLater(
            <JournalView history={[ROW]} plans={[]} />,
        );
        expect(errors).toEqual([]);
        expect(container.textContent).toContain('about 9 hours ago');
    });

    it('hydrates the recent assessments list without a mismatch when the page was rendered an hour earlier', () => {
        const errors = hydrateAnHourLater(
            <HistoryPanel
                history={[ROW]}
                isDeletePending={false}
                onDelete={vi.fn()}
                onDeleteAll={vi.fn()}
                onSelect={vi.fn()}
            />,
        );
        expect(errors).toEqual([]);
        expect(container.textContent).toContain('about 9 hours ago');
    });
});
