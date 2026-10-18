import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    UNSAVED_CHANGES_PROMPT,
    useUnsavedChangesGuard,
} from '~/app/(app)/prop-calculator/accounts/_components/useUnsavedChangesGuard';

type Guard = ReturnType<typeof useUnsavedChangesGuard>;

function answerLeaving(willLeave: boolean): string[] {
    const asked: string[] = [];
    vi.stubGlobal('confirm', (message: string) => {
        asked.push(message);
        return willLeave;
    });
    return asked;
}

function unload(): Event {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event;
}

describe('useUnsavedChangesGuard', () => {
    let container: HTMLDivElement;
    let root: Root;
    let latest: Guard | null;

    function Harness({ isDirty }: { readonly isDirty: boolean }) {
        latest = useUnsavedChangesGuard(isDirty);
        return null;
    }

    function render(isDirty: boolean) {
        act(() => {
            root.render(<Harness isDirty={isDirty} />);
        });
    }

    function guard(): Guard {
        if (latest === null) throw new Error('hook not rendered');
        return latest;
    }

    function navigate(): { readonly preventDefault: () => void } {
        const navigation = { preventDefault: vi.fn() };
        guard()(navigation);
        return navigation;
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        latest = null;
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('lets a clean form unload and navigate without asking', () => {
        const asked = answerLeaving(false);
        render(false);
        expect(unload().defaultPrevented).toBe(false);
        expect(navigate().preventDefault).not.toHaveBeenCalled();
        expect(asked).toEqual([]);
    });

    it('holds the unload of a dirty form and releases it once the form is clean again', () => {
        render(true);
        expect(unload().defaultPrevented).toBe(true);
        render(false);
        expect(unload().defaultPrevented).toBe(false);
    });

    it('stops navigating away from a dirty form when the trader keeps editing', () => {
        const asked = answerLeaving(false);
        render(true);
        expect(navigate().preventDefault).toHaveBeenCalledTimes(1);
        expect(asked).toEqual([UNSAVED_CHANGES_PROMPT]);
    });

    it('navigates away from a dirty form when the trader confirms leaving', () => {
        answerLeaving(true);
        render(true);
        expect(navigate().preventDefault).not.toHaveBeenCalled();
    });
});
