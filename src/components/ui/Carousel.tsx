'use client';

import useEmblaCarousel, {
    type UseEmblaCarouselType,
} from 'embla-carousel-react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import * as React from 'react';

import { Button } from '~/components/ui/Button';
import { cn } from '~/lib/utils';

type CarouselApi = UseEmblaCarouselType[1];
interface CarouselContextProperties extends CarouselProperties {
    api: ReturnType<typeof useEmblaCarousel>[1];
    canScrollNext: boolean;
    canScrollPrev: boolean;
    carouselRef: ReturnType<typeof useEmblaCarousel>[0];
    scrollNext: () => void;
    scrollPrev: () => void;
}
type CarouselOptions = NonNullable<Parameters<typeof useEmblaCarousel>[0]>;

type CarouselPlugin = NonNullable<Parameters<typeof useEmblaCarousel>[1]>;

interface CarouselProperties {
    opts?: CarouselOptions;
    orientation?: 'horizontal' | 'vertical';
    plugins?: CarouselPlugin;
    setApi?: (api: CarouselApi) => void;
}

const CarouselContext = React.createContext<CarouselContextProperties | null>(
    null,
);

function useCarousel() {
    const context = React.useContext(CarouselContext);
    if (!context) {
        throw new Error('useCarousel must be used within a <Carousel />');
    }
    return context;
}

const Carousel = React.forwardRef<
    HTMLDivElement,
    CarouselProperties & React.HTMLAttributes<HTMLDivElement>
>(
    (
        {
            children,
            className,
            opts,
            orientation = 'horizontal',
            plugins,
            setApi,
            ...properties
        },
        reference,
    ) => {
        const [carouselReference, api] = useEmblaCarousel(
            {
                ...opts,
                axis: orientation === 'horizontal' ? 'x' : 'y',
            },
            plugins,
        );
        const [canScrollPrevious, setCanScrollPrevious] = React.useState(false);
        const [canScrollNext, setCanScrollNext] = React.useState(false);

        const onSelect = React.useCallback((next: CarouselApi) => {
            if (!next) return;
            setCanScrollPrevious(next.canScrollPrev());
            setCanScrollNext(next.canScrollNext());
        }, []);

        const scrollPrevious = React.useCallback(
            () => api?.scrollPrev(),
            [api],
        );
        const scrollNext = React.useCallback(() => api?.scrollNext(), [api]);

        const handleKeyDown = React.useCallback(
            (event: React.KeyboardEvent<HTMLDivElement>) => {
                if (event.key === 'ArrowLeft') {
                    event.preventDefault();
                    scrollPrevious();
                } else if (event.key === 'ArrowRight') {
                    event.preventDefault();
                    scrollNext();
                }
            },
            [scrollPrevious, scrollNext],
        );

        React.useEffect(() => {
            if (api && setApi) setApi(api);
        }, [api, setApi]);

        React.useEffect(() => {
            if (!api) return;
            onSelect(api);
            api.on('reInit', onSelect);
            api.on('select', onSelect);
            return () => {
                api.off('select', onSelect);
            };
        }, [api, onSelect]);

        return (
            <CarouselContext.Provider
                value={{
                    api,
                    canScrollNext,
                    canScrollPrev: canScrollPrevious,
                    carouselRef: carouselReference,
                    opts,
                    orientation,
                    scrollNext,
                    scrollPrev: scrollPrevious,
                }}
            >
                <div
                    aria-roledescription="carousel"
                    className={cn('relative', className)}
                    onKeyDownCapture={handleKeyDown}
                    ref={reference}
                    role="region"
                    {...properties}
                >
                    {children}
                </div>
            </CarouselContext.Provider>
        );
    },
);
Carousel.displayName = 'Carousel';

const CarouselContent = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...properties }, reference) => {
    const { carouselRef, orientation } = useCarousel();
    return (
        <div className="overflow-hidden" ref={carouselRef}>
            <div
                className={cn(
                    'flex',
                    orientation === 'horizontal' ? '-ml-4' : '-mt-4 flex-col',
                    className,
                )}
                ref={reference}
                {...properties}
            />
        </div>
    );
});
CarouselContent.displayName = 'CarouselContent';

const CarouselItem = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...properties }, reference) => {
    const { orientation } = useCarousel();
    return (
        <div
            aria-roledescription="slide"
            className={cn(
                'min-w-0 shrink-0 grow-0 basis-full',
                orientation === 'horizontal' ? 'pl-4' : 'pt-4',
                className,
            )}
            ref={reference}
            role="group"
            {...properties}
        />
    );
});
CarouselItem.displayName = 'CarouselItem';

const CarouselPrevious = React.forwardRef<
    HTMLButtonElement,
    React.ComponentProps<typeof Button>
>(
    (
        { className, size = 'icon', variant = 'outline', ...properties },
        reference,
    ) => {
        const { canScrollPrev, orientation, scrollPrev } = useCarousel();
        return (
            <Button
                className={cn(
                    'absolute size-8 rounded-full',
                    orientation === 'horizontal'
                        ? 'top-1/2 -left-12 -translate-y-1/2'
                        : '-top-12 left-1/2 -translate-x-1/2 rotate-90',
                    className,
                )}
                disabled={!canScrollPrev}
                onClick={scrollPrev}
                ref={reference}
                size={size}
                variant={variant}
                {...properties}
            >
                <ArrowLeft className="size-4" />
                <span className="sr-only">Previous slide</span>
            </Button>
        );
    },
);
CarouselPrevious.displayName = 'CarouselPrevious';

const CarouselNext = React.forwardRef<
    HTMLButtonElement,
    React.ComponentProps<typeof Button>
>(
    (
        { className, size = 'icon', variant = 'outline', ...properties },
        reference,
    ) => {
        const { canScrollNext, orientation, scrollNext } = useCarousel();
        return (
            <Button
                className={cn(
                    'absolute size-8 rounded-full',
                    orientation === 'horizontal'
                        ? 'top-1/2 -right-12 -translate-y-1/2'
                        : '-bottom-12 left-1/2 -translate-x-1/2 rotate-90',
                    className,
                )}
                disabled={!canScrollNext}
                onClick={scrollNext}
                ref={reference}
                size={size}
                variant={variant}
                {...properties}
            >
                <ArrowRight className="size-4" />
                <span className="sr-only">Next slide</span>
            </Button>
        );
    },
);
CarouselNext.displayName = 'CarouselNext';

export {
    Carousel,
    type CarouselApi,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
};
