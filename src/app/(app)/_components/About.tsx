import { Card } from '~/components/ui/Card';

import GallerySection, { type GalleryItem } from './GallerySection';

export default function AboutSection({
    spotifyEmbedUrl,
    gallery,
}: {
    spotifyEmbedUrl: string;
    gallery: GalleryItem[];
}) {
    return (
        <div className="pt-spacing-inner">
            <Card>
                <div className="grid gap-y-5">
                    <GallerySection items={gallery} />

                    <div className="mb-spacing-inner mx-auto lg:mb-0 lg:w-1/2">
                        <iframe
                            title="Spotify Track"
                            className="min-w-full rounded-2xl"
                            src={spotifyEmbedUrl}
                            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                            allowFullScreen
                            height={152}
                            loading="lazy"
                        />
                    </div>
                </div>
            </Card>
        </div>
    );
}
