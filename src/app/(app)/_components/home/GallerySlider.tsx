'use client';

import AutoScroll from 'embla-carousel-auto-scroll';
import { ArrowLeft, ArrowRight, Pause, Play } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '~/components/ui/button';
import {
    Carousel,
    type CarouselApi,
    CarouselContent,
    CarouselItem,
    useCarousel,
} from '~/components/ui/carousel';
import { useIsReducedMotion } from '~/components/useIsReducedMotion';
import { type CaptionedPhoto } from '~/lib/site/content';
import { cn } from '~/lib/utilities';

import { MediaAspect, MediaFrame } from './MediaFrame';

const AUTO_SCROLL_START_DELAY_MS = 150;
const AUTO_SCROLL_SPEED_PX_PER_FRAME = 1.2;

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
    const galleryRef = useRef<HTMLDivElement>(null);
    const [api, setApi] = useState<CarouselApi>();
    const [isInView, setIsInView] = useState(false);
    const [choice, setChoice] = useState<null | PlaybackChoice>(null);
    const isPlaying =
        isInView &&
        (choice === null ? !isReducedMotion : choice === PlaybackChoice.Play);
    const autoScroll = useMemo(
        () =>
            AutoScroll({
                playOnInit: false,
                speed: AUTO_SCROLL_SPEED_PX_PER_FRAME,
                startDelay: AUTO_SCROLL_START_DELAY_MS,
                stopOnInteraction: false,
            }),
        [],
    );

    useEffect(() => {
        const gallery = galleryRef.current;
        if (!gallery) return;
        const observer = new IntersectionObserver(([entry]) => {
            setIsInView(entry?.isIntersecting ?? false);
        });
        observer.observe(gallery);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!api) return;
        const updatePlayback = () => {
            if (isPlaying) autoScroll.play();
            else autoScroll.stop();
        };
        updatePlayback();
        api.on('reInit', updatePlayback);
        return () => {
            api.off('reInit', updatePlayback);
            autoScroll.stop();
        };
    }, [api, autoScroll, isPlaying]);

    return (
        <Carousel
            aria-label="Personal photo gallery"
            className={cn('app-home__gallery', 'w-full')}
            opts={{
                align: 'start',
                dragFree: true,
                loop: false,
            }}
            plugins={[autoScroll]}
            ref={galleryRef}
            setApi={setApi}
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
                    onStopPlayback={() => setChoice(PlaybackChoice.Pause)}
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
    onStopPlayback,
    onTogglePlayback,
}: {
    readonly isPlaying: boolean;
    readonly onStopPlayback: () => void;
    readonly onTogglePlayback: () => void;
}) {
    const { api, canScrollNext, canScrollPrev, scrollNext, scrollPrev } =
        useCarousel();

    useEffect(() => {
        if (!api) return;
        const stopAtEnd = () => {
            if (api.scrollProgress() >= 1) onStopPlayback();
        };
        api.on('autoScroll:stop', stopAtEnd);
        api.on('settle', stopAtEnd);
        return () => {
            api.off('autoScroll:stop', stopAtEnd);
            api.off('settle', stopAtEnd);
        };
    }, [api, onStopPlayback]);

    const navigate = (scroll: () => void) => {
        api?.plugins().autoScroll.reset();
        scroll();
    };

    return (
        <div className="flex items-center gap-1 rounded-full border glass p-1.5">
            <Button
                aria-label={isPlaying ? 'Pause slideshow' : 'Play slideshow'}
                aria-pressed={isPlaying}
                disabled={!isPlaying && !canScrollNext}
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
                onClick={() => navigate(scrollPrev)}
                size="icon-tap"
                type="button"
                variant="capsule"
            >
                <ArrowLeft aria-hidden strokeWidth={1.6} />
            </Button>
            <Button
                aria-label="Next photo"
                disabled={!canScrollNext}
                onClick={() => navigate(scrollNext)}
                size="icon-tap"
                type="button"
                variant="capsule"
            >
                <ArrowRight aria-hidden strokeWidth={1.6} />
            </Button>
        </div>
    );
}
