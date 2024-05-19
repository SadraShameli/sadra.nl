import Image from 'next/image';

import ProfilePicture from '~/assets/images/me.jpg';
import SectionDescription from '~/components/SectionDescription';
import SectionText from '~/components/SectionText';
import SectionTitle from '~/components/SectionTitle';
import TextAnimation from '~/components/ui/Animations/Text';
import TypeWriterAnimation from '~/components/ui/Animations/TypeWriter';
import GridBackground from '~/components/ui/GridBg';
import Resume from '~/data/Resume';
import { api } from '~/trpc/server';

import AboutSection from './_components/About';
import Navbar from './_components/Navbar';
import ReadingSection from './_components/Reading/Reading';
import RecordingSection from './_components/Recording/Recording';
import ResumeSection from './_components/Resume/Resume';
import SocialsSection from './_components/Socials';

export default async function HomePage() {
    const recordings = (await api.recording.getRecordingsNoFile()).map(
        (result) => {
            return result;
        },
    );
    const readings = (await api.sensor.getSensorReadings({})).data;
    const sensors = (await api.sensor.getEnabledSensors()).data;
    const locations = (await api.location.getLocations()).data;

    return (
        <>
            <Navbar />
            <GridBackground />
            <main className="grid w-full px-6 xl:px-0">
                <div className="mx-auto flex h-screen max-w-content flex-col-reverse justify-between xl:w-screen xl:flex-row">
                    <div className="my-auto mt-10 flex flex-col justify-center gap-y-3 xl:mt-auto">
                        <TextAnimation
                            className="text-3xl font-semibold text-white md:text-6xl xl:text-7xl"
                            text={Resume.basics.title}
                            el="h1"
                        />
                        <TypeWriterAnimation
                            className="bg-gradient-purple-anim mx-auto text-xl font-semibold xl:mx-0"
                            text={Resume.description}
                        />
                    </div>

                    <div className="mt-content h-fit lg:my-auto">
                        <Image
                            className="rounded-2xl object-cover sm:max-w-lg xl:mx-0 xl:self-auto"
                            src={ProfilePicture}
                            alt="Profile picture"
                            priority
                        />
                    </div>
                </div>

                {recordings.length ? (
                    <div className="mx-auto my-content max-w-content">
                        <SectionTitle text="Noise recordings" />
                        <SectionDescription text="Here you will find a list of noise recordings made by my devices, which are placed at various locations in Rotterdam and Rijswijk, The Netherlands, gathering climate and loudness levels." />
                        <RecordingSection recordings={recordings} />
                    </div>
                ) : null}

                {readings && locations && sensors ? (
                    <ReadingSection
                        readings={readings}
                        locations={locations}
                        sensors={sensors}
                    />
                ) : null}

                <div className="mx-auto my-content max-w-content">
                    <SectionText text="Recent projects" />
                    <ResumeSection />
                </div>

                <div className="mx-auto my-content max-w-content">
                    <SectionText text="More about me" />
                    <AboutSection />
                </div>

                <div className="mx-auto mb-32 mt-content w-full max-w-content">
                    <SectionText text="Follow my socials" />
                    <SocialsSection />
                </div>
            </main>
        </>
    );
}
