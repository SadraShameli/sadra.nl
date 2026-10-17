import { homepageContent } from '~/lib/site/content';
import { HomeSectionId } from '~/lib/site/homeSections';

import { SectionHeading } from './EmphasisTitle';
import { GallerySlider } from './GallerySlider';
import { HomeSectionShell, SectionTone } from './HomeSectionShell';

export function AboutSection() {
    const { gallery, heading, spotifyEmbedUrl, spotifyLabel } =
        homepageContent.about;
    return (
        <HomeSectionShell id={HomeSectionId.About} tone={SectionTone.Ground}>
            <SectionHeading heading={heading} />
            <GallerySlider photos={gallery} />

            <div className="mx-auto flex w-full max-w-capsule flex-col gap-3 rounded-xl border border-line bg-surface p-5">
                <span className="type-micro text-camel">{spotifyLabel}</span>
                <iframe
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    className="h-38 w-full rounded-sm border-0"
                    loading="lazy"
                    src={spotifyEmbedUrl}
                    title="Spotify track on repeat"
                />
            </div>
        </HomeSectionShell>
    );
}
