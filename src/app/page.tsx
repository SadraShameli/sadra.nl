import Image from 'next/image';

import ProfilePicture from '~/assets/images/sadra.jpg';
import SectionDescription from '~/components/SectionDescription';
import SectionTitle from '~/components/SectionTitle';
import resumeSadra from '~/data/Resume/Sadra';

import ArrowRight from '~/components/ui/Icons/ArrowRight';
import AboutSection from './_components/About';
import ReadingSection from './_components/Reading/Reading';
import RecordingSection from './_components/Recording/Recording';

export default async function HomePage() {
    return (
        <main>
            <section className="mt-spacing container grid-cols-2 grid-rows-2 items-center gap-5 lg:mt-[-68px] lg:grid lg:h-screen lg:grid-rows-none lg:gap-20">
                <Image
                    className="aspect-square rounded-2xl object-cover"
                    src={ProfilePicture}
                    alt="Profile picture"
                    loading="eager"
                    priority
                />

                <div className="mt-spacing-inner flex flex-col lg:mt-0">
                    <h1 className="text-6xl font-semibold text-white lg:text-8xl lg:font-bold">
                        {resumeSadra.basics.title}
                    </h1>

                    <p className="bg-gradient-neutral-anim mt-5 text-lg font-semibold lg:mt-10 lg:text-xl">
                        {resumeSadra.description}
                    </p>

                    <a
                        className="group relative mt-3 inline-block w-fit cursor-pointer rounded-lg bg-neutral-800 p-px text-xs font-semibold leading-6 text-white no-underline shadow-2xl shadow-zinc-900"
                        href="/resume"
                    >
                        <span className="absolute inset-0 overflow-hidden rounded-lg">
                            <span className="absolute inset-0 rounded-lg bg-[image:radial-gradient(75%_100%_at_50%_0%,rgba(25,25,25,0.6)_0%,rgba(25,25,25,0)_75%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                        </span>

                        <div className="relative z-10 flex items-center space-x-2 rounded-lg bg-zinc-950 px-4 py-0.5 ring-1 ring-white/10">
                            <span className="font-bold">More about me</span>

                            <ArrowRight className="size-7" />
                        </div>

                        <span className="absolute -bottom-0 left-[1.125rem] h-px w-[calc(100%-2.25rem)] bg-gradient-to-r from-neutral-400/0 via-neutral-400/90 to-neutral-400/0 transition-opacity duration-500 group-hover:opacity-40" />
                    </a>
                </div>
            </section>

            <section className="my-spacing container">
                <SectionTitle text="This is Sensor Hub" />

                <SectionDescription text="Devices made by me, designed to record and register various climate telemetry and noise pollution data." />

                <video className="mt-spacing-inner rounded-2xl" loop autoPlay muted playsInline>
                    <source src="/sensorUnit.mp4" type="video/mp4" />
                </video>
            </section>

            <section className="my-spacing container">
                <SectionTitle text="Noise recordings" />
                <SectionDescription text="Here you will find a list of noise recordings made by the Sensor Hub devices, which are placed at various locations in the Netherlands." />
                <RecordingSection />
            </section>

            <section className="my-spacing container">
                <SectionTitle text="Live readings" />
                <SectionDescription text="Ever been curious about the temperature, humidity and loudness levels at various locations in real time?" />
                <ReadingSection />
            </section>

            <section className="mt-spacing container">
                <SectionTitle text="More about me" />
                <AboutSection />
            </section>
        </main>
    );
}
