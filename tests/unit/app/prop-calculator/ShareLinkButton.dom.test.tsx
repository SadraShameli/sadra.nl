import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ShareLinkButton from '~/app/(app)/prop-calculator/_components/ShareLinkButton';

const COPIED_RESET_MS = 1500;

describe('ShareLinkButton', () => {
    let container: HTMLDivElement;
    let root: Root;
    let writeText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;

    async function click() {
        await act(async () => {
            container.querySelector('button')?.click();
            await Promise.resolve();
        });
    }

    function render() {
        act(() => {
            root.render(
                <ShareLinkButton
                    buildLink={(origin, pathname) =>
                        `${origin}${pathname}?built=1`
                    }
                />,
            );
        });
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        writeText = vi.fn<(text: string) => Promise<void>>();
        vi.stubGlobal('navigator', { clipboard: { writeText } });
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('mounts an empty polite status region beside the button before any copy', () => {
        render();
        const region = container.querySelector('[role="status"]');
        expect(region).not.toBeNull();
        expect(region?.textContent).toBe('');
        expect(container.querySelector('button')?.contains(region)).toBe(false);
    });

    it('starts idle with the share label', () => {
        render();
        expect(container.textContent).toContain('Share link');
        expect(container.querySelector('button')?.dataset.state).toBe('idle');
    });

    it('copies the built link and says Copied, then resets', async () => {
        writeText.mockResolvedValue();
        render();
        await click();
        expect(writeText).toHaveBeenCalledExactlyOnceWith(
            `${window.location.origin}${window.location.pathname}?built=1`,
        );
        expect(container.textContent).toContain('Copied');
        expect(container.querySelector('button')?.dataset.state).toBe('copied');
        act(() => {
            vi.advanceTimersByTime(COPIED_RESET_MS);
        });
        expect(container.textContent).toContain('Share link');
    });

    it('says the copy failed when the clipboard rejects, then resets', async () => {
        writeText.mockRejectedValue(new Error('denied'));
        render();
        await click();
        expect(container.textContent).toContain('Could not copy');
        expect(container.textContent).not.toContain('Copied');
        const region = container.querySelector('[role="status"]');
        expect(region?.textContent).toBe('Could not copy');
        expect(container.querySelector('button')?.contains(region)).toBe(false);
        act(() => {
            vi.advanceTimersByTime(COPIED_RESET_MS);
        });
        expect(container.textContent).toContain('Share link');
        expect(container.textContent).not.toContain('Could not copy');
        expect(container.querySelector('[role="status"]')?.textContent).toBe('');
    });

    it('says the copy failed when the clipboard is unavailable', async () => {
        vi.stubGlobal('navigator', {});
        render();
        await click();
        expect(container.textContent).toContain('Could not copy');
    });
});
