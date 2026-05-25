import { Card } from '~/components/ui/Card';
import { cn } from '~/lib/utils';

import GallerySection, { type GalleryItem } from './GallerySection';

export default function AboutSection({
    gallery,
    spotifyEmbed,
}: {
    gallery: GalleryItem[];
    spotifyEmbed: string;
}) {
    return (
        <div className={cn('app-home__about-card', 'pt-spacing-inner')}>
            <Card>
                <div className="grid gap-y-5">
                    <GallerySection items={gallery} />

                    <div
                        className={cn(
                            'app-home__spotify',
                            'mx-auto w-full px-4 lg:w-1/2 [&>iframe]:w-full',
                        )}
                        dangerouslySetInnerHTML={{ __html: spotifyEmbed }}
                    />
                </div>
            </Card>
        </div>
    );
}
