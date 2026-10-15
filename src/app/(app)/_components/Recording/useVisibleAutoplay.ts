import { type RefObject, useLayoutEffect, useRef } from 'react';

enum RefusedPlaybackError {
    Aborted = 'AbortError',
    NotAllowed = 'NotAllowedError',
}

const REFUSED_PLAYBACK_ERRORS: ReadonlySet<string> = new Set(
    Object.values(RefusedPlaybackError),
);

export function useVisibleAutoplay(): RefObject<HTMLVideoElement | null> {
    const video = useRef<HTMLVideoElement>(null);

    useLayoutEffect(() => {
        const element = video.current;
        if (element?.paused) {
            void resume(element);
        }
        return () => {
            element?.pause();
        };
    }, []);

    return video;
}

async function resume(element: HTMLVideoElement): Promise<void> {
    try {
        await element.play();
    } catch (error) {
        if (
            !(error instanceof DOMException) ||
            !REFUSED_PLAYBACK_ERRORS.has(error.name)
        ) {
            throw error;
        }
        console.warn('The decorative video could not resume:', error);
    }
}
