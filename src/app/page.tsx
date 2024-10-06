import Image from 'next/image';

import ProfilePicture from '~/assets/images/sadra.jpg';
import SectionDescription from '~/components/SectionDescription';
import SectionText from '~/components/SectionText';
import SectionTitle from '~/components/SectionTitle';
import RevealAnimation from '~/components/ui/Animations/Reveal';
import GridBackground from '~/components/ui/GridBg';
import resumeSadra from '~/data/Resume/Sadra';

import ArrowRight from '~/components/ui/Icons/ArrowRight';
import AboutSection from './_components/About';
import Navbar from './_components/Navbar';
import ReadingSection from './_components/Reading/Reading';
import RecordingSection from './_components/Recording/Recording';

export default async function HomePage() {
    return (
        <>
            <Navbar />
            <GridBackground />

            <main className="grid w-full px-6 xl:px-0">
                <div className="mx-auto grid h-screen max-w-content items-center justify-center">
                    <RevealAnimation>
                        <div className="flex flex-col gap-y-3 text-center">
                            <h1 className="text-5xl font-semibold text-white md:text-6xl xl:text-7xl">
                                {resumeSadra.basics.title}
                            </h1>

                            <p className="bg-gradient-neutral-anim text-lg font-semibold md:text-xl">
                                {resumeSadra.description}
                            </p>

                            <a
                                className="group relative mx-auto mt-2 inline-block w-fit cursor-pointer rounded-lg bg-neutral-800 p-px text-xs font-semibold leading-6 text-white no-underline shadow-2xl shadow-zinc-900"
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

                        <Image
                            className="mx-auto mt-20 size-2/3 rounded-2xl object-cover sm:size-1/4"
                            src={ProfilePicture}
                            alt="Profile picture"
                            priority
                        />
                    </RevealAnimation>
                </div>

                <RevealAnimation>
                    <div className="mx-auto mb-content max-w-content">
                        <SectionTitle text="This is Sensor Hub" />
                        <SectionDescription text="Devices made by me, designed to record and register various climate telemetry and noise pollution data." />
                        <video className="mx-auto rounded-2xl md:size-10/12" loop autoPlay muted playsInline>
                            <source src="/sensorUnit.mp4" type="video/mp4" />
                        </video>
                    </div>
                </RevealAnimation>

                <div className="mx-auto my-content max-w-content">
                    <SectionTitle text="Noise recordings" />
                    <SectionDescription text="Here you will find a list of noise recordings made by the Sensor Hub devices, which are placed at various locations in the Netherlands." />
                    <RecordingSection />
                </div>

                <div className="mx-auto my-content w-full max-w-content">
                    <SectionTitle text="Live readings" />
                    <SectionDescription text="Ever been curious about the temperature, humidity and loudness levels at various locations in real time?" />
                    <ReadingSection />
                </div>

                <div className="mx-auto mb-10 max-w-content md:my-content">
                    <SectionText text="More about me" />
                    <AboutSection />
                </div>
            </main>
        </>
    );
}
