'use client';

import { useLayoutEffect, useRef } from 'react';

import type { LoopingVideo } from '~/lib/site/content';

const INTERRUPTED_PLAYBACK = new Set(['AbortError', 'NotAllowedError']);

export function AutoplayVideo({
    className,
    video,
}: {
    readonly className?: string;
    readonly video: LoopingVideo;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useLayoutEffect(() => {
        const element = videoRef.current;
        if (!element) return;
        const observer = new IntersectionObserver(([entry]) => {
            if (entry?.isIntersecting) {
                void playUnlessInterrupted(element);
            } else {
                element.pause();
            }
        });
        observer.observe(element);
        return () => {
            observer.disconnect();
            element.pause();
        };
    }, []);

    return (
        <video
            className={className}
            loop
            muted
            playsInline
            poster={video.poster}
            preload="none"
            ref={videoRef}
        >
            <source src={video.src} type="video/mp4" />
        </video>
    );
}

async function playUnlessInterrupted(element: HTMLVideoElement) {
    try {
        await element.play();
    } catch (error) {
        if (
            error instanceof DOMException &&
            INTERRUPTED_PLAYBACK.has(error.name)
        ) {
            return;
        }
        throw error;
    }
}
