import Image from 'next/image';
import { notFound } from 'next/navigation';

import SectionDescription from '~/components/SectionDescription';
import SectionTitle from '~/components/SectionTitle';
import ArrowRight from '~/components/ui/Icons/ArrowRight';
import {
    getHomepageGlobal,
    getSiteGlobal,
    isHomepageComplete,
    isPopulatedMedia,
    isSiteComplete,
    mediaUrl,
    pageLinkHref,
} from '~/lib/cms';
import type { Homepage } from '~/payload-types';

import AboutSection from './_components/About';
import type { GalleryItem } from './_components/GallerySection';
import ReadingSection from './_components/Reading/Reading';
import RecordingSection from './_components/Recording/Recording';

export const dynamic = 'force-dynamic';

function galleryItems(homepage: Homepage): GalleryItem[] {
    const rows = homepage.gallery ?? [];
    const out: GalleryItem[] = [];
    for (const row of rows) {
        if (!isPopulatedMedia(row.image)) continue;
        out.push({
            src: mediaUrl(row.image.url),
            alt: row.alt ?? '',
        });
    }
    return out;
}

export default async function HomePage() {
    const [homepage, site] = await Promise.all([
        getHomepageGlobal(),
        getSiteGlobal(),
    ]);
    if (!isHomepageComplete(homepage) || !isSiteComplete(site)) {
        notFound();
    }

    const resumeCtaHref = pageLinkHref(site.pageLinks.resumeUrl);

    const heroImage = mediaUrl(homepage.heroImage.url);
    const sensorVideoSrc = mediaUrl(homepage.sensorHubVideo.url);
    const recordingDecorSrc = mediaUrl(homepage.recordingDecorVideo.url);
    const gallery = galleryItems(homepage);

    return (
        <main>
            <section className="pt-spacing container grid-cols-2 grid-rows-2 items-center gap-5 lg:mt-[-68px] lg:grid lg:h-screen lg:grid-rows-none lg:gap-20">
                <Image
                    className="aspect-square rounded-2xl object-cover"
                    src={heroImage}
                    alt=""
                    width={800}
                    height={800}
                    priority
                    unoptimized
                />

                <div className="pt-spacing-inner flex flex-col lg:mt-0">
                    <h1 className="text-6xl font-semibold text-white lg:text-8xl lg:font-bold">
                        {homepage.heroTitle}
                    </h1>

                    <p className="bg-gradient-neutral-anim mt-5 text-lg font-semibold lg:mt-10 lg:text-xl">
                        {homepage.heroSubtitle}
                    </p>

                    <a
                        className="group relative mt-3 inline-block w-fit cursor-pointer rounded-lg bg-neutral-800 p-px text-xs leading-6 font-semibold text-white no-underline shadow-2xl shadow-zinc-900"
                        href={resumeCtaHref}
                    >
                        <span className="absolute inset-0 overflow-hidden rounded-lg">
                            <span className="absolute inset-0 rounded-lg bg-[image:radial-gradient(75%_100%_at_50%_0%,rgba(25,25,25,0.6)_0%,rgba(25,25,25,0)_75%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                        </span>

                        <div className="relative z-10 flex items-center space-x-2 rounded-lg bg-zinc-950 px-4 py-0.5 ring-1 ring-white/10">
                            <span className="font-bold">
                                {homepage.ctaLabel}
                            </span>

                            <ArrowRight className="size-7" />
                        </div>

                        <span className="absolute -bottom-0 left-[1.125rem] h-px w-[calc(100%-2.25rem)] bg-linear-to-r from-neutral-400/0 via-neutral-400/90 to-neutral-400/0 transition-opacity duration-500 group-hover:opacity-40" />
                    </a>
                </div>
            </section>

            <section className="py-spacing container">
                <SectionTitle text={homepage.sensorHubTitle} />

                <SectionDescription text={homepage.sensorHubDescription} />

                <video
                    className="pt-spacing-inner rounded-2xl"
                    loop
                    autoPlay
                    muted
                    playsInline
                >
                    <source src={sensorVideoSrc} type="video/mp4" />
                </video>
            </section>

            <section className="py-spacing container">
                <SectionTitle text={homepage.recordingsTitle} />
                <SectionDescription text={homepage.recordingsDescription} />
                <RecordingSection decorVideoUrl={recordingDecorSrc} />
            </section>

            <section className="py-spacing container">
                <SectionTitle text={homepage.readingsTitle} />
                <SectionDescription text={homepage.readingsDescription} />
                <ReadingSection />
            </section>

            <section className="pt-spacing container">
                <SectionTitle text={homepage.aboutSectionTitle} />
                <AboutSection
                    spotifyEmbedUrl={homepage.aboutSpotifyEmbedUrl}
                    gallery={gallery}
                />
            </section>
        </main>
    );
}
