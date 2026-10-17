'use client';

import Autoplay from 'embla-carousel-autoplay';
import { ArrowLeft, ArrowRight, Pause, Play } from 'lucide-react';
import Image from 'next/image';
import { useMemo, useState } from 'react';

import { Button } from '~/components/ui/Button';
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    useCarousel,
} from '~/components/ui/Carousel';
import { useIsReducedMotion } from '~/components/useIsReducedMotion';
import { type CaptionedPhoto } from '~/lib/site/content';
import { cn } from '~/lib/utilities';

import { MediaAspect, MediaFrame } from './MediaFrame';

const AUTOPLAY_DELAY_MS = 3500;

enum PlaybackChoice {
    Pause = 'pause',
    Play = 'play',
}

export function GallerySlider({
    photos,
}: {
    readonly photos: readonly CaptionedPhoto[];
}) {
    const isReducedMotion = useIsReducedMotion();
    const [choice, setChoice] = useState<null | PlaybackChoice>(null);
    const isPlaying =
        choice === null ? !isReducedMotion : choice === PlaybackChoice.Play;
    const autoplay = useMemo(
        () =>
            Autoplay({
                delay: AUTOPLAY_DELAY_MS,
                playOnInit: isPlaying,
                stopOnInteraction: false,
            }),
        [isPlaying],
    );

    return (
        <Carousel
            className={cn('app-home__gallery', 'w-full')}
            opts={{ align: 'start', loop: true }}
            plugins={[autoplay]}
        >
            <CarouselContent>
                {photos.map((photo) => (
                    <CarouselItem
                        className="basis-[85%] sm:basis-1/2 lg:basis-[31%]"
                        key={photo.caption}
                    >
                        <MediaFrame
                            aspect={MediaAspect.Photo}
                            caption={photo.caption}
                            tag={photo.tag}
                        >
                            <Image
                                alt={photo.alt}
                                className="object-cover"
                                fill
                                placeholder="blur"
                                sizes="(min-width: 1024px) 420px, (min-width: 640px) 50vw, 85vw"
                                src={photo.image}
                            />
                        </MediaFrame>
                    </CarouselItem>
                ))}
            </CarouselContent>
            <div className="mt-6 flex justify-end">
                <SliderControls
                    isPlaying={isPlaying}
                    onTogglePlayback={() =>
                        setChoice(
                            isPlaying
                                ? PlaybackChoice.Pause
                                : PlaybackChoice.Play,
                        )
                    }
                />
            </div>
        </Carousel>
    );
}

function SliderControls({
    isPlaying,
    onTogglePlayback,
}: {
    readonly isPlaying: boolean;
    readonly onTogglePlayback: () => void;
}) {
    const { canScrollNext, canScrollPrev, scrollNext, scrollPrev } =
        useCarousel();
    return (
        <div className="flex items-center gap-1 rounded-full border glass p-1.5">
            <Button
                aria-label={isPlaying ? 'Pause slideshow' : 'Play slideshow'}
                aria-pressed={isPlaying}
                onClick={onTogglePlayback}
                size="icon-tap"
                type="button"
                variant="capsule"
            >
                {isPlaying ? (
                    <Pause aria-hidden strokeWidth={1.6} />
                ) : (
                    <Play aria-hidden strokeWidth={1.6} />
                )}
            </Button>
            <span aria-hidden className="mx-1 h-6 w-px bg-line" />
            <Button
                aria-label="Previous photo"
                disabled={!canScrollPrev}
                onClick={scrollPrev}
                size="icon-tap"
                type="button"
                variant="capsule"
            >
                <ArrowLeft aria-hidden strokeWidth={1.6} />
            </Button>
            <Button
                aria-label="Next photo"
                disabled={!canScrollNext}
                onClick={scrollNext}
                size="icon-tap"
                type="button"
                variant="capsule"
            >
                <ArrowRight aria-hidden strokeWidth={1.6} />
            </Button>
        </div>
    );
}
