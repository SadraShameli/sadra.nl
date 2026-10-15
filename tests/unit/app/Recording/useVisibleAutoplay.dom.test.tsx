import { act, Activity } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    type MockInstance,
    vi,
} from 'vitest';

import { useVisibleAutoplay } from '~/app/(app)/_components/Recording/useVisibleAutoplay';

function doNothing(): void {
    return;
}

function Harness() {
    const video = useVisibleAutoplay();
    return (
        <video autoPlay loop muted ref={video}>
            <track kind="captions" />
        </video>
    );
}

async function playNothing(): Promise<void> {
    return;
}

describe('useVisibleAutoplay', () => {
    let container: HTMLDivElement;
    let root: Root;
    let pause: MockInstance<() => void>;
    let play: MockInstance<() => Promise<void>>;

    function renderIn(mode: 'hidden' | 'visible') {
        act(() => {
            root.render(
                <Activity mode={mode}>
                    <Harness />
                </Activity>,
            );
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        play = vi
            .spyOn(HTMLMediaElement.prototype, 'play')
            .mockImplementation(playNothing);
        pause = vi
            .spyOn(HTMLMediaElement.prototype, 'pause')
            .mockImplementation(doNothing);
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

    it('pauses the video while its route is hidden and resumes it when shown again', () => {
        renderIn('visible');
        play.mockClear();

        renderIn('hidden');
        expect(pause).toHaveBeenCalledTimes(1);
        expect(play).not.toHaveBeenCalled();

        renderIn('visible');
        expect(play).toHaveBeenCalledTimes(1);
    });
});
