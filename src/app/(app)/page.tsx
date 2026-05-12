import { Calculator, ClipboardList, type LucideIcon, User } from 'lucide-react';
import Image from 'next/image';

import SectionDescription from '~/components/SectionDescription';
import SectionTitle from '~/components/SectionTitle';
import { homepageContent, siteContent } from '~/lib/content';

import AboutSection from './_components/About';
import ReadingSection from './_components/Reading/Reading';
import RecordingSection from './_components/Recording/Recording';

function HeroToolChip({
    href,
    label,
    icon: Icon,
}: {
    href: string;
    label: string;
    icon: LucideIcon;
}) {
    return (
        <a
            className="group inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-2 text-xs font-medium text-white no-underline transition hover:border-white/20 hover:bg-white/10 hover:text-white"
            href={href}
        >
            <Icon className="size-3.5 shrink-0" strokeWidth={2} />
            <span>{label}</span>
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

                    <div className="mt-10 flex flex-wrap gap-2">
                        <HeroToolChip
                            href={resumeHref}
                            label={homepageContent.ctaLabel}
                            icon={User}
                        />
                        <HeroToolChip
                            href="/prop-calculator"
                            label="Prop firm calculator"
                            icon={Calculator}
                        />
                        <HeroToolChip
                            href="/trade-checklist"
                            label="Trade checklist"
                            icon={ClipboardList}
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
