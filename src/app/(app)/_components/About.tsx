import { Card } from '~/components/ui/Card';

import GallerySection, { type GalleryItem } from './GallerySection';

export default function AboutSection({
    gallery,
    spotifyEmbedUrl,
}: {
    gallery: GalleryItem[];
    spotifyEmbedUrl: string;
}) {
    return (
        <div className="pt-spacing-inner">
            <Card>
                <div className="grid gap-y-5">
                    <GallerySection items={gallery} />

                    <div className="mx-auto mb-spacing-inner lg:mb-0 lg:w-1/2">
                        <iframe
                            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                            allowFullScreen
                            className="min-w-full rounded-2xl"
                            height={152}
                            loading="lazy"
                            src={spotifyEmbedUrl}
                            title="Spotify Track"
                        />
                    </div>
                </div>
            </Card>
        </div>
    );
}
