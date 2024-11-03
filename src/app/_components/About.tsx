import GallerySection from './GallerySection';

import { Card } from '~/components/ui/Card';

export default function AboutSection() {
    return (
        <div className="pt-spacing-inner">
            <Card>
                <div className="grid gap-y-5">
                    <GallerySection />

                    <div className="mx-auto mb-spacing-inner lg:mb-0 lg:w-1/2">
                        <iframe
                            className="min-w-full rounded-2xl"
                            src="https://open.spotify.com/embed/track/4kjI1gwQZRKNDkw1nI475M?utm_source=generator&theme=0"
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
