import Image from 'next/image';

import StaggerAnimation from '~/components/ui/Animations/Stagger';
import { cn } from '~/lib/utils';

export type GalleryItem = {
    alt: string;
    src: string;
};

export default function GallerySection({ items }: { items: GalleryItem[] }) {
    if (items.length === 0) return null;

    return (
        <div
            className={cn(
                'app-home__gallery',
                'px-4 py-6 pt-spacing-inner lg:mt-0 lg:px-10 lg:py-20',
            )}
        >
            <StaggerAnimation className="grid grid-cols-2 lg:grid-cols-4">
                {items.map((item, index) => (
                    <Image
                        alt={item.alt}
                        className={cn(
                            'app-home__gallery-item',
                            'size-full origin-bottom transform rounded-xl object-cover shadow-2xl duration-500 ease-out hover:z-50 hover:-translate-y-6 hover:scale-105 hover:rotate-0 lg:hover:-translate-y-12',
                            index % 2 === 0 ? 'rotate-6' : '-rotate-12',
                        )}
                        height={800}
                        key={item.src}
                        src={item.src}
                        unoptimized={
                            item.src.startsWith('http') ||
                            item.src.startsWith('/api/')
                        }
                        width={800}
                    />
                ))}
            </StaggerAnimation>
        </div>
    );
}
