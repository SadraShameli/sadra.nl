import Image from 'next/image';

import StaggerAnimation from '~/components/ui/Animations/Stagger';
import { cn } from '~/lib/utils';

export type GalleryItem = {
    src: string;
    alt: string;
};

export default function GallerySection({ items }: { items: GalleryItem[] }) {
    if (!items || items.length === 0) return null;

    return (
        <div className="pt-spacing-inner px-4 py-6 lg:mt-0 lg:px-10 lg:py-20">
            <StaggerAnimation className="grid grid-cols-2 lg:grid-cols-4">
                {items.map((item, index) => (
                    <Image
                        key={item.src}
                        className={cn(
                            'size-full origin-bottom transform rounded-xl object-cover shadow-2xl duration-500 ease-out hover:z-50 hover:-translate-y-6 hover:scale-105 hover:rotate-0 lg:hover:-translate-y-12',
                            index % 2 === 0 ? 'rotate-6' : '-rotate-12',
                        )}
                        src={item.src}
                        alt={item.alt}
                        width={800}
                        height={800}
                        unoptimized={
                            item.src.startsWith('http') ||
                            item.src.startsWith('/api/')
                        }
                    />
                ))}
            </StaggerAnimation>
        </div>
    );
}
