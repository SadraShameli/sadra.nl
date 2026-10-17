'use client';

import { Check, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

import { homepageContent } from '~/lib/site/content';
import { type HeroShowcaseView } from '~/lib/site/HeroShowcase';
import { cn } from '~/lib/utilities';

import { GarageIllustration } from './GarageIllustration';

const SPARKLINE =
    '0,44 24,40 48,42 72,33 96,35 120,26 144,28 168,17 192,19 216,9 240,4';

export function HeroCollage({
    showcase,
}: {
    readonly showcase: HeroShowcaseView;
}) {
    const [revealed, setRevealed] = useState(false);
    const { garage, payout, profitAndLoss } = homepageContent.hero;
    const money = cn(
        'transition-[filter] duration-350',
        !revealed && 'money-hidden',
    );

    return (
        <div className="relative mx-auto h-145 max-w-117.5 min-w-0 flex-[1_1_360px]">
            <div className="absolute top-0 right-0 z-1 w-[64%] rotate-4">
                <figure className="m-0 flex animate-bob flex-col gap-2.5 rounded-xl border border-line bg-surface-raised p-2.5 shadow-float">
                    <div className="relative aspect-4/5 overflow-hidden rounded-sm">
                        <GarageIllustration label={garage.alt} />
                    </div>
                    <figcaption className="flex items-baseline justify-between px-1.5 py-0.5">
                        <span className="type-display-caption text-[17px] text-ink">
                            {garage.caption}
                        </span>
                        <span className="type-micro tracking-[0.16em] text-camel">
                            {garage.tag}
                        </span>
                    </figcaption>
                </figure>
            </div>

            <div className="absolute top-50 left-0 z-2 w-[68%] -rotate-5">
                <div className="@container flex animate-bob-fast flex-col gap-3 rounded-[18px] border border-line-strong bg-glass p-5.5 shadow-float backdrop-blur-md">
                    <div className="flex items-center justify-between">
                        <span className="type-micro tracking-[0.18em] text-ink-muted">
                            {profitAndLoss.label}
                        </span>
                        <button
                            aria-label="Show or hide numbers"
                            aria-pressed={revealed}
                            className="flex size-11 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-transparent text-ink focus-camel transition hover:border-line-hover hover:bg-surface-raised"
                            onClick={() => setRevealed((current) => !current)}
                            type="button"
                        >
                            {revealed ? (
                                <EyeOff
                                    aria-hidden
                                    className="size-4.5"
                                    strokeWidth={1.6}
                                />
                            ) : (
                                <Eye
                                    aria-hidden
                                    className="size-4.5"
                                    strokeWidth={1.6}
                                />
                            )}
                        </button>
                    </div>
                    <span
                        aria-hidden={!revealed}
                        className={cn(
                            'type-display-figure text-[min(42px,13cqi)] whitespace-nowrap text-camel',
                            money,
                        )}
                    >
                        {showcase.today}
                    </span>
                    <svg
                        aria-hidden
                        className="h-13 w-full"
                        preserveAspectRatio="none"
                        viewBox="0 0 240 52"
                    >
                        <polyline
                            className="fill-none stroke-camel"
                            points={SPARKLINE}
                            strokeLinejoin="round"
                            strokeWidth={1.6}
                            vectorEffect="non-scaling-stroke"
                        />
                    </svg>
                    <div className="flex gap-4.5 font-mono text-[11px] tracking-[0.06em] text-ink-muted">
                        <span className="flex gap-1.5">
                            WIN RATE{' '}
                            <span className={cn('text-ink', money)}>
                                {showcase.winRate}
                            </span>
                        </span>
                        <span className="flex gap-1.5">
                            AVG{' '}
                            <span className={cn('text-ink', money)}>
                                {showcase.averageR}
                            </span>
                        </span>
                    </div>
                </div>
            </div>

            <div className="absolute right-1.5 bottom-0 z-3 w-[62%] rotate-7">
                <div className="flex aspect-[1.586/1] animate-bob-slow flex-col justify-between rounded-lg border border-line-camel bg-linear-140 from-metal-sheen via-metal-lo via-55% to-surface-high p-5 text-camel shadow-float">
                    <div className="flex items-center justify-between">
                        <span className="type-micro font-bold">Payout</span>
                        <span className="flex items-center gap-1.5 type-micro tracking-[0.16em]">
                            PAID
                            <Check
                                aria-hidden
                                className="size-3"
                                strokeWidth={2.4}
                            />
                        </span>
                    </div>
                    <span
                        aria-hidden={!revealed}
                        className={cn(
                            'font-serif text-[32px] leading-none font-medium tracking-[-0.01em]',
                            money,
                        )}
                    >
                        {showcase.totalPayout}
                    </span>
                    <div className="flex justify-between type-micro tracking-[0.14em] text-ink-muted">
                        <span>{payout.firm}</span>
                        <span>{payout.date}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
