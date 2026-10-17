'use client';

import { useEffect, useState } from 'react';

import { HeroMode, homepageContent } from '~/lib/site/content';
import { cn } from '~/lib/utilities';

import { CandleBackdrop, SignalBackdrop } from './HeroBackdrop';

const HERO_MODES = [HeroMode.Trader, HeroMode.Developer] as const;
const DEVELOPER_AFTER_VIEWPORT_SHARE = 0.12;

export function HeroIntro() {
    const [mode, setMode] = useState(HeroMode.Trader);

    useEffect(() => {
        let frame = 0;
        const followScroll = () => {
            frame = 0;
            setMode(modeForScroll(window.scrollY, window.innerHeight));
        };
        const scheduleFollow = () => {
            if (frame === 0) frame = requestAnimationFrame(followScroll);
        };
        scheduleFollow();
        window.addEventListener('scroll', scheduleFollow, { passive: true });
        return () => {
            window.removeEventListener('scroll', scheduleFollow);
            cancelAnimationFrame(frame);
        };
    }, []);

    return (
        <>
            {mode === HeroMode.Trader ? <SignalBackdrop /> : <CandleBackdrop />}

            <div className="relative flex min-w-0 flex-[999_1_640px] flex-col gap-12">
                <h1 className="m-0 flex flex-col items-start type-display-hero">
                    {HERO_MODES.map((entry) => (
                        <HeroWord
                            isActive={entry === mode}
                            key={entry}
                            mode={entry}
                            onPick={() => setMode(entry)}
                        />
                    ))}
                </h1>
            </div>
        </>
    );
}

function HeroWord({
    isActive,
    mode,
    onPick,
}: {
    readonly isActive: boolean;
    readonly mode: HeroMode;
    readonly onPick: () => void;
}) {
    const copy = homepageContent.hero.modes[mode];
    return (
        <button
            aria-pressed={isActive}
            className={cn(
                'app-home__hero-word',
                'm-0 cursor-pointer border-0 bg-transparent p-0 text-left transition-[color,-webkit-text-stroke-color] duration-400 focus-visible:rounded-md focus-visible:outline-1 focus-visible:outline-offset-10 focus-visible:outline-camel',
                mode === HeroMode.Developer && 'italic',
                isActive ? 'text-ink' : 'outline-word',
            )}
            onClick={onPick}
            type="button"
        >
            {copy.word}
            <span className="text-camel [-webkit-text-stroke:0]">
                {copy.punctuation}
            </span>
        </button>
    );
}

function modeForScroll(scrollY: number, viewportHeight: number): HeroMode {
    return scrollY > viewportHeight * DEVELOPER_AFTER_VIEWPORT_SHARE
        ? HeroMode.Developer
        : HeroMode.Trader;
}
