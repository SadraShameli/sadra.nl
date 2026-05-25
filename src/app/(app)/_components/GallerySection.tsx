'use client';

import Autoplay from 'embla-carousel-autoplay';
import { Pause, Play } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useRef, useState } from 'react';

import { Button } from '~/components/ui/Button';
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
} from '~/components/ui/Carousel';
import { cn } from '~/lib/utils';

export type GalleryItem = {
    alt: string;
    src: string;
};

export default function GallerySection({ items }: { items: GalleryItem[] }) {
    const autoplay = useRef(
        Autoplay({ delay: 3500, stopOnInteraction: false }),
    );
    const [isPlaying, setIsPlaying] = useState(true);

    const togglePlay = useCallback(() => {
        const plugin = autoplay.current;
        if (plugin.isPlaying()) {
            plugin.stop();
            setIsPlaying(false);
        } else {
            plugin.play();
            setIsPlaying(true);
        }
    }, []);

    if (items.length === 0) return null;

    return (
        <div
            className={cn(
                'app-home__gallery',
                'px-4 py-6 pt-spacing-inner lg:mt-0 lg:px-10',
            )}
        >
            <Carousel
                className="w-full"
                opts={{ align: 'start', loop: true }}
                plugins={[autoplay.current]}
            >
                <CarouselContent>
                    {items.map((item) => (
                        <CarouselItem
                            className="basis-[58.82352941176471%] lg:basis-[28.571428571428573%]"
                            key={item.src}
                        >
                            <Image
                                alt={item.alt}
                                className={cn(
                                    'app-home__gallery-item',
                                    'h-full rounded-xl object-cover',
                                )}
                                height={800}
                                src={item.src}
                                unoptimized={
                                    item.src.startsWith('http') ||
                                    item.src.startsWith('/api/')
                                }
                                width={800}
                            />
                        </CarouselItem>
                    ))}
                </CarouselContent>
                <div className="mt-4 flex justify-end gap-2">
                    <Button
                        aria-label={isPlaying ? 'Pause' : 'Play'}
                        className="size-8 rounded-full"
                        onClick={togglePlay}
                        size="icon"
                        variant="outline"
                    >
                        {isPlaying ? (
                            <Pause className="size-4" />
                        ) : (
                            <Play className="size-4" />
                        )}
                    </Button>
                    <CarouselPrevious className="static translate-y-0" />
                    <CarouselNext className="static translate-y-0" />
                </div>
            </Carousel>
        </div>
    );
}
