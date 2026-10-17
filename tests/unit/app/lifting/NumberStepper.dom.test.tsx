import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NumberStepper } from '~/app/(app)/lifting/_components/shared/NumberStepper';

function ControlledStepper() {
    const [value, setValue] = useState(0);
    return (
        <NumberStepper
            decimals={0}
            label="Reps"
            onChange={setValue}
            value={value}
        />
    );
}

describe('NumberStepper', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(<ControlledStepper />);
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    function shown(): string {
        return container.querySelector('.text-lg')?.textContent ?? '';
    }

    it('keeps stepping from the current value while the button is held', () => {
        const increase = container.querySelector(
            '[aria-label="Increase Reps"]',
        );
        if (increase === null) throw new Error('no increase button');
        act(() => {
            increase.dispatchEvent(
                new PointerEvent('pointerdown', { bubbles: true }),
            );
        });
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        const afterOneSecond = Number(shown());
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        const afterTwoSeconds = Number(shown());
        act(() => {
            increase.dispatchEvent(
                new PointerEvent('pointerup', { bubbles: true }),
            );
        });

        expect(afterOneSecond).toBeGreaterThan(6);
        expect(afterTwoSeconds).toBeGreaterThan(afterOneSecond);
    });
});
