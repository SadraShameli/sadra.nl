import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTodayIsoDate } from '~/app/(app)/prop-calculator/_components/useTodayIsoDate';

const MS_PER_MINUTE = 60_000;

function Harness({ seen }: { readonly seen: string[] }) {
    seen.push(useTodayIsoDate());
    return null;
}

describe('useTodayIsoDate', () => {
    let root: Root;
    let container: HTMLElement;
    let seen: string[];

    function visibility(state: 'hidden' | 'visible') {
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => state,
        });
    }

    beforeEach(() => {
        vi.useFakeTimers({ now: new Date('2026-09-26T23:30:00Z') });
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        visibility('visible');
        seen = [];
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(<Harness seen={seen} />);
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        Reflect.deleteProperty(document, 'visibilityState');
    });

    it('starts on the current UTC day', () => {
        expect(seen.at(-1)).toBe('2026-09-26');
    });

    it('moves to the next day at midnight without a remount', () => {
        act(() => {
            vi.advanceTimersByTime(31 * MS_PER_MINUTE);
        });
        expect(seen.at(-1)).toBe('2026-09-27');
    });

    it('keeps the day within the same day', () => {
        act(() => {
            vi.advanceTimersByTime(10 * MS_PER_MINUTE);
        });
        expect(new Set(seen)).toEqual(new Set(['2026-09-26']));
    });

    it('rolls over again at the next midnight', () => {
        act(() => {
            vi.advanceTimersByTime(31 * MS_PER_MINUTE);
        });
        act(() => {
            vi.advanceTimersByTime(24 * 60 * MS_PER_MINUTE);
        });
        expect(seen.at(-1)).toBe('2026-09-28');
    });

    it('resyncs when the tab becomes visible after the clock moved on', () => {
        vi.setSystemTime(new Date('2026-09-29T08:00:00Z'));
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'));
        });
        expect(seen.at(-1)).toBe('2026-09-29');
    });

    it('resyncs when the window regains focus', () => {
        vi.setSystemTime(new Date('2026-09-29T08:00:00Z'));
        act(() => {
            window.dispatchEvent(new Event('focus'));
        });
        expect(seen.at(-1)).toBe('2026-09-29');
    });

    it('does not resync while the tab is hidden', () => {
        visibility('hidden');
        vi.setSystemTime(new Date('2026-09-29T08:00:00Z'));
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'));
        });
        expect(seen.at(-1)).toBe('2026-09-26');
    });

    it('stops listening after unmount', () => {
        const removed = vi.spyOn(window, 'removeEventListener');
        act(() => {
            root.unmount();
        });
        expect(removed).toHaveBeenCalledWith('focus', expect.any(Function));
        root = createRoot(container);
    });
});
