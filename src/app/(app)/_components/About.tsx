import { Card } from '~/components/ui/Card';
import { cn } from '~/lib/utilities';

import GallerySection, { type GalleryItem } from './GallerySection';

export default function AboutSection({ gallery }: { gallery: GalleryItem[] }) {
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
                    >
                        <iframe
                            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                            allowFullScreen
                            data-testid="embed-iframe"
                            height="152"
                            loading="lazy"
                            src="https://open.spotify.com/embed/track/74Jja0PIrdXE0aK0a6hxPN?utm_source=generator&theme=0"
                            style={{ borderRadius: '12px' }}
                            title="Spotify embed"
                            width="100%"
                        />
                    </div>
                </div>
            </Card>
        </div>
    );
}
