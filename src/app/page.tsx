import Image from 'next/image';

import ProfilePicture from '~/assets/images/sadra.jpg';
import SectionDescription from '~/components/SectionDescription';
import SectionText from '~/components/SectionText';
import SectionTitle from '~/components/SectionTitle';
import RevealAnimation from '~/components/ui/Animations/Reveal';
import TypeWriterAnimation from '~/components/ui/Animations/TypeWriter';
import GridBackground from '~/components/ui/GridBg';
import ResumeSadra from '~/data/Resume/Sadra';
import { api } from '~/trpc/server';

import AboutSection from './_components/About';
import Navbar from './_components/Navbar';
import ReadingSection from './_components/Reading/Reading';
import RecordingSection from './_components/Recording/Recording';
import ResumeSection from './_components/Resume/Resume';
import SocialsSection from './_components/Socials';

export default async function HomePage() {
  const recordings = await api.recording.getRecordingsNoFile();
  const locations = (await api.location.getLocationsWithReading()).data;
  const sensors = (await api.sensor.getEnabledSensors()).data;

  return (
    <>
      <Navbar />
      <GridBackground />
      <main className="grid w-full px-6 xl:px-0">
        <div className="mx-auto flex h-screen max-w-content flex-col-reverse justify-between xl:w-screen xl:flex-row">
          <div className="my-auto mt-14 flex flex-col justify-center xl:mt-auto">
            <RevealAnimation>
              <div className="flex flex-col gap-y-3">
                <h1 className="text-3xl font-semibold text-white md:text-6xl xl:text-7xl">
                  {ResumeSadra.basics.title}
                </h1>
                <TypeWriterAnimation
                  className="bg-gradient-purple-anim text-lg font-semibold md:text-xl"
                  text={ResumeSadra.description}
                />
              </div>
            </RevealAnimation>
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

        {locations?.[0] && sensors?.[0] ? (
          <ReadingSection
            sensors={sensors}
            locations={locations}
            location={locations[0]}
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
      </main>

      <div className="mx-auto mb-28 mt-content w-full border-t pt-56">
        <div className="mx-auto max-w-content px-6 xl:px-0">
          <SectionText text="Follow my socials" />
          <SocialsSection />
        </div>
      </div>
    </>
  );
}
