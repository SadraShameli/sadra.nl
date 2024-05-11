import Image from 'next/image';

import ProfilePicture from '~/assets/images/me.jpg';
import TextAnimation from '~/components/Animations/Text';
import Resume from '~/data/Resume';

import About from './components/About';
import ResumeSection from './components/Resume';
import SocialsSection from './components/Socials';

export default function HomePage() {
    return (
        <main className='grid w-full px-6 xl:px-0'>
            <div className='mx-auto flex h-screen max-w-content flex-col-reverse justify-between xl:w-screen xl:flex-row'>
                <div className='my-auto mt-10 grid justify-center space-y-3 xl:mt-auto'>
                    <TextAnimation className='text-center text-5xl font-semibold text-white md:text-6xl xl:text-7xl' text={Resume.basics.title} el='h2' />

                    <TextAnimation
                        className='bg-gradient-emerald-anim mx-auto max-w-fit text-center text-2xl font-semibold xl:mx-0 xl:text-start'
                        text={Resume.description}
                        el='span'
                        splitChar
                    />
                </div>

                <div className='my-auto grid justify-center space-y-3'>
                    <Image className='rounded-2xl object-cover sm:max-w-lg xl:mx-0 xl:self-auto' src={ProfilePicture} alt='Profile picture' priority />
                </div>
            </div>

            <div className='mx-auto my-content max-w-content space-y-10'>
                <ResumeSection />
            </div>

            <div className='mx-auto my-content max-w-content'>
                <About />
            </div>

            <div className='mx-auto mb-32 mt-content w-full max-w-content'>
                <SocialsSection />
            </div>
        </main>
    );
}
