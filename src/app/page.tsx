import Image from 'next/image';
import Navbar from './components/Navbar';
import SocialMediaSection from './components/SocialMediaSection';

import Resume from '~/data/Resume';
import ProfilePicture from '~/assets/images/me.jpg';

export default function HomePage() {
    return (
        <main className='px-6 xl:px-0'>
            <Navbar />
            <div className='my-20 xl:mb-0'>
                <div className='mx-auto mb-20 flex w-full max-w-main flex-col-reverse justify-between xl:flex-row'>
                    <div className='my-auto mt-10 grid justify-center space-y-3 xl:mt-auto'>
                        <h1 className='text-center text-5xl font-semibold tracking-wide text-white lg:text-7xl'>{Resume.basics.title}</h1>
                        <span className='bg-gradient-indigo text-center text-2xl font-semibold tracking-widest xl:text-start'>{Resume.basics.role}</span>
                    </div>

                    <Image className='mx-auto rounded-2xl sm:max-w-md xl:mx-0' src={ProfilePicture} alt='Profile picture' priority />
                </div>

                <SocialMediaSection />
            </div>
        </main>
    );
}
