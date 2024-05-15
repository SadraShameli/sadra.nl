import Image from 'next/image';

import ProfilePicture from '~/assets/images/me.jpg';
import TextAnimation from '~/components/Animations/Text';
import TypeWriterAnimation from '~/components/Animations/TypeWriter';
import BackgroundSnipper from '~/components/BackgroundSnippet';
import Resume from '~/data/Resume';

import AboutSection from './components/About';
// import ReadingSection from './components/Reading/Reading';
import Navbar from './components/Navbar';
import ResumeSection from './components/Resume/Resume';
import SocialsSection from './components/Socials';

export default function HomePage() {
    return (
        <>
            <Navbar />
            <BackgroundSnipper />
            <main className='grid w-full px-6 xl:px-0'>
                <div className='mx-auto flex h-screen max-w-content flex-col-reverse justify-between xl:w-screen xl:flex-row'>
                    <div className='my-auto mt-10 flex flex-col justify-center space-y-3 xl:mt-auto'>
                        <TextAnimation className='text-3xl font-semibold text-white md:text-6xl xl:text-7xl' text={Resume.basics.title} el='h1' />

                        <TypeWriterAnimation className='bg-gradient-emerald-anim mx-auto text-xl font-semibold xl:mx-0' text={Resume.description} />
                    </div>

                    <div className='mt-content h-fit lg:my-auto'>
                        <Image className='rounded-2xl object-cover sm:max-w-lg xl:mx-0 xl:self-auto' src={ProfilePicture} alt='Profile picture' priority />
                    </div>
                </div>

                {/* <div className='mx-auto my-content max-w-content space-y-10'>
                    <ReadingSection />
                </div> */}

                <div className='mx-auto my-content max-w-content space-y-10'>
                    <ResumeSection />
                </div>

                <div className='mx-auto my-content max-w-content'>
                    <AboutSection />
                </div>

                <div className='mx-auto mb-32 mt-content w-full max-w-content'>
                    <SocialsSection />
                </div>
            </main>
        </>
    );
}
