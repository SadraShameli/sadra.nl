import { Calculator } from 'lucide-react';
import Image from 'next/image';

import SectionDescription from '~/components/SectionDescription';
import SectionTitle from '~/components/SectionTitle';
import ArrowRight from '~/components/ui/Icons/ArrowRight';
import { homepageContent, siteContent } from '~/lib/content';

import AboutSection from './_components/About';
import ReadingSection from './_components/Reading/Reading';
import RecordingSection from './_components/Recording/Recording';

function HeroCta({ href, label }: { href: string; label: string }) {
    return (
        <a
            className="group relative inline-block w-fit cursor-pointer rounded-lg bg-neutral-800 p-px text-xs leading-6 font-semibold text-white no-underline shadow-2xl shadow-zinc-900"
            href={href}
        >
            <span className="absolute inset-0 overflow-hidden rounded-lg">
                <span className="absolute inset-0 rounded-lg bg-[radial-gradient(75%_100%_at_50%_0%,rgba(25,25,25,0.6)_0%,rgba(25,25,25,0)_75%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            </span>

            <div className="relative z-10 flex items-center space-x-2 rounded-lg bg-zinc-950 px-4 py-0.5 ring-1 ring-white/10">
                <span className="font-bold">{label}</span>

                <ArrowRight className="size-7" />
            </div>

            <span className="absolute bottom-0 left-4.5 h-px w-[calc(100%-2.25rem)] bg-linear-to-r from-neutral-400/0 via-neutral-400/90 to-neutral-400/0 transition-opacity duration-500 group-hover:opacity-40" />
        </a>
    );
}

function HeroCtaSecondary({ href, label }: { href: string; label: string }) {
    return (
        <a
            className="inline-flex w-fit items-center gap-2 rounded-lg bg-white px-4 py-1 text-xs leading-6 font-bold text-black no-underline shadow-2xl shadow-zinc-900 transition-colors hover:bg-white/90"
            href={href}
        >
            <span>{label}</span>
            <Calculator className="size-4" strokeWidth={2.5} />
        </a>
    );
}

export default function HomePage() {
    const resumeHref = siteContent.resumeUrl;
    const { heroImage, gallery } = homepageContent;

    return (
        <main>
            <section className="container grid-cols-2 grid-rows-2 items-center gap-5 pt-spacing lg:-mt-17 lg:grid lg:h-screen lg:grid-rows-none lg:gap-20">
                <Image
                    className="aspect-square rounded-2xl object-cover"
                    src={heroImage}
                    alt=""
                    width={800}
                    height={800}
                    priority
                />

                <div className="flex flex-col pt-spacing-inner lg:mt-0">
                    <h1 className="text-6xl font-semibold text-white lg:text-8xl lg:font-bold">
                        {homepageContent.heroTitle}
                    </h1>

                    <p className="mt-5 bg-gradient-neutral-anim text-lg font-semibold lg:mt-5 lg:text-xl">
                        {homepageContent.heroSubtitle}
                    </p>

                    <div className="mt-10 flex flex-wrap items-center gap-3">
                        <HeroCta
                            href={resumeHref}
                            label={homepageContent.ctaLabel}
                        />
                        <HeroCtaSecondary
                            href="/prop-calculator"
                            label="Prop firm calculator"
                        />
                    </div>
                </div>
            </section>

            <section className="container py-spacing">
                <SectionTitle text={homepageContent.sensorHubTitle} />

                <SectionDescription
                    text={homepageContent.sensorHubDescription}
                />

                <video
                    className="rounded-2xl pt-spacing-inner"
                    loop
                    autoPlay
                    muted
                    playsInline
                >
                    <source
                        src={homepageContent.sensorHubVideo}
                        type="video/mp4"
                    />
                </video>
            </section>

            <section className="container py-spacing">
                <SectionTitle text={homepageContent.recordingsTitle} />
                <SectionDescription
                    text={homepageContent.recordingsDescription}
                />
                <RecordingSection
                    decorVideoUrl={homepageContent.recordingDecorVideo}
                />
            </section>

            <section className="container py-spacing">
                <SectionTitle text={homepageContent.readingsTitle} />
                <SectionDescription
                    text={homepageContent.readingsDescription}
                />
                <ReadingSection />
            </section>

            <section className="container pt-spacing">
                <SectionTitle text={homepageContent.aboutSectionTitle} />
                <AboutSection
                    spotifyEmbedUrl={homepageContent.aboutSpotifyEmbedUrl}
                    gallery={gallery}
                />
            </section>
        </main>
    );
}
