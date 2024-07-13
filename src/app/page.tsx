import Image from 'next/image';

import ProfilePicture from '~/assets/images/sadra.jpg';
import SectionDescription from '~/components/SectionDescription';
import SectionText from '~/components/SectionText';
import SectionTitle from '~/components/SectionTitle';
import RevealAnimation from '~/components/ui/Animations/Reveal';
import GridBackground from '~/components/ui/GridBg';
import ResumeSadra from '~/data/Resume/Sadra';

import AboutSection from './_components/About';
import Navbar from './_components/Navbar';
import ReadingSection from './_components/Reading/Reading';
import RecordingSection from './_components/Recording/Recording';
// import ResumeSection from './_components/Resume/Resume';

export default async function HomePage() {
  return (
    <>
      <Navbar />
      <GridBackground />

      <main className="grid w-full px-6 xl:px-0">
        <div className="mx-auto h-screen max-w-content items-center justify-center">
          <RevealAnimation>
            <div className="flex flex-col gap-y-3 text-center">
              <h1 className="mt-32 text-5xl font-semibold text-white md:text-6xl xl:text-7xl">
                {ResumeSadra.basics.title}
              </h1>

              <p className="bg-gradient-neutral-anim text-lg font-semibold md:text-xl">
                {ResumeSadra.description}
              </p>
            </div>

            <Image
              className="mx-auto mt-20 rounded-2xl object-cover sm:size-1/4"
              src={ProfilePicture}
              alt="Profile picture"
              priority
            />
          </RevealAnimation>
        </div>

        <RevealAnimation>
          <div className="mx-auto max-w-content">
            <SectionTitle text="This is Sensor Hub" />
            <SectionDescription text="Devices made by me, designed to record and register various climate telemetry and noise pollution data." />
            <video
              className="mx-auto rounded-2xl md:size-10/12"
              loop
              autoPlay
              muted
              playsInline
            >
              <source src="/sensorUnit.mp4" type="video/mp4" />
            </video>
          </div>
        </RevealAnimation>

        <div className="mx-auto max-w-content md:mt-content">
          <SectionTitle text="Noise recordings" />
          <SectionDescription text="Here you will find a list of noise recordings made by the Sensor Hub devices, which are placed at various locations in the Netherlands." />
          <RecordingSection />
        </div>

        <ReadingSection />

        {/* <div className="mx-auto my-content max-w-content">
          <SectionText text="Recent projects" />
          <ResumeSection />
        </div> */}

        <div className="mx-auto mb-10 max-w-content md:my-content">
          <SectionText text="More about me" />
          <AboutSection />
        </div>
      </main>
    </>
  );
}
