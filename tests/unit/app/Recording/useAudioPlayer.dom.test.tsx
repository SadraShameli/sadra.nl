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

import { type RecordingSummary } from '~/app/(app)/_components/Recording/types';
import { useAudioPlayer } from '~/app/(app)/_components/Recording/useAudioPlayer';

const RECORDINGS: RecordingSummary[] = [
    {
        created_at: new Date('2026-01-01T00:00:00Z'),
        device_id: 1,
        duration_seconds: 60,
        file_name: 'first.wav',
        id: 7,
        location_id: 1,
    },
];

type Player = ReturnType<typeof useAudioPlayer>;

function doNothing(): void {
    return;
}

async function playNothing(): Promise<void> {
    return;
}

describe('useAudioPlayer', () => {
    let container: HTMLDivElement;
    let root: Root;
    let latest: null | Player;
    let pause: MockInstance<() => void>;

    function Harness() {
        const player = useAudioPlayer({ recordings: RECORDINGS });
        latest = player;
        return (
            <audio ref={player.audioRef}>
                <track kind="captions" />
            </audio>
        );
    }

    function player(): Player {
        if (latest === null) throw new Error('hook not rendered');
        return latest;
    }

    function audio(): HTMLAudioElement {
        const element = container.querySelector('audio');
        if (element === null) throw new Error('no audio element');
        return element;
    }

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
        vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(
            doNothing,
        );
        vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(
            playNothing,
        );
        pause = vi
            .spyOn(HTMLMediaElement.prototype, 'pause')
            .mockImplementation(doNothing);
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

    it('pauses playback when its route is hidden and keeps the loaded recording for when it is shown again', async () => {
        renderIn('visible');
        const source = audio().src;
        expect(source).toContain('/api/recording/7');
        await act(async () => {
            await player().playAudio();
        });
        expect(player().isPlaying).toBe(true);
        pause.mockClear();

        renderIn('hidden');
        expect(pause).toHaveBeenCalled();

        renderIn('visible');
        expect(player().isPlaying).toBe(false);
        expect(audio().src).toBe(source);
    });
});
