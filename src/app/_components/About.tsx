import GallerySection from './GallerySection';

import Card from '~/components/ui/Card';
import RevealAnimation from '~/components/ui/Animations/Reveal';

export default function AboutSection() {
    return (
        <RevealAnimation>
            <Card>
                <div className="grid gap-y-12">
                    <GallerySection />
                    <iframe
                        className="rounded-2xl md:mx-auto lg:w-1/2"
                        src="https://open.spotify.com/embed/track/4kjI1gwQZRKNDkw1nI475M?utm_source=generator&theme=0"
                        width="100%"
                        height="152"
                        allowFullScreen={true}
                        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                        loading="lazy"
                    />
                </div>
            </Card>
        </RevealAnimation>
    );
}
