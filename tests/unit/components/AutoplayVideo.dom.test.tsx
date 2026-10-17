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

import { AutoplayVideo } from '~/components/AutoplayVideo';
import { homepageContent } from '~/lib/site/content';

type IntersectionCallback = (entries: { isIntersecting: boolean }[]) => void;

const observerCallbacks: IntersectionCallback[] = [];

class RecordingIntersectionObserver {
    constructor(callback: IntersectionCallback) {
        observerCallbacks.push(callback);
    }

    disconnect(): void {
        return;
    }

    observe(): void {
        return;
    }
}

function doNothing(): void {
    return;
}

async function playNothing(): Promise<void> {
    return;
}

function scrollIntoView() {
    act(() => {
        observerCallbacks.at(-1)?.([{ isIntersecting: true }]);
    });
}

describe('AutoplayVideo', () => {
    let container: HTMLDivElement;
    let root: Root;
    let pause: MockInstance<() => void>;
    let play: MockInstance<() => Promise<void>>;

    function renderIn(mode: 'hidden' | 'visible') {
        act(() => {
            root.render(
                <Activity mode={mode}>
                    <AutoplayVideo
                        video={homepageContent.recordings.decorVideo}
                    />
                </Activity>,
            );
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        vi.stubGlobal('IntersectionObserver', RecordingIntersectionObserver);
        observerCallbacks.length = 0;
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

    it('shows the first frame as its poster and loads nothing until it plays', () => {
        renderIn('visible');
        const video = container.querySelector('video');
        expect(video?.getAttribute('poster')).toBe(
            homepageContent.recordings.decorVideo.poster,
        );
        expect(video?.getAttribute('preload')).toBe('none');
        expect(play).not.toHaveBeenCalled();
    });

    it('plays once scrolled into view, pauses while its route is hidden and plays again when shown', () => {
        renderIn('visible');
        scrollIntoView();
        expect(play).toHaveBeenCalledTimes(1);

        renderIn('hidden');
        expect(pause).toHaveBeenCalled();

        play.mockClear();
        renderIn('visible');
        scrollIntoView();
        expect(play).toHaveBeenCalledTimes(1);
    });
});
