import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    SetRow,
    type SetRowData,
} from '~/app/(app)/lifting/_components/log/SetRow';

function loggedSet(id: string, completedAt: Date | null): SetRowData {
    return {
        completedAt,
        distanceM: null,
        durationS: null,
        id,
        order: 1,
        reps: 5,
        rir: null,
        rpe: null,
        tempo: null,
        type: 'working',
        weightKg: 100,
    };
}

describe('SetRow', () => {
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

    function submitButtonOf(set: SetRowData): HTMLButtonElement {
        act(() => {
            root.render(
                <SetRow
                    onComplete={vi.fn()}
                    onDelete={vi.fn()}
                    set={set}
                    unitDistance="m"
                    unitWeight="kg"
                />,
            );
        });
        const button = container.querySelector('button[type="submit"]');
        if (!(button instanceof HTMLButtonElement)) {
            throw new TypeError('no submit button');
        }
        return button;
    }

    it('shows a done set by its icon and name alone, styling the button the same as an open set', () => {
        const open = submitButtonOf(loggedSet('open-set', null));
        const openName = open.getAttribute('aria-label');
        const openStyle = open.className;
        const done = submitButtonOf(
            loggedSet('done-set', new Date('2026-10-18T09:00:00Z')),
        );
        expect(openName).toBe('Complete set');
        expect(done.getAttribute('aria-label')).toBe('Set done, save changes');
        expect(done.className).toBe(openStyle);
    });
});
