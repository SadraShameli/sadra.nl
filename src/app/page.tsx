import Image from 'next/image';
import Navbar from './components/Navbar';
import SocialMediaSection from './components/SocialMediaSection';

import Resume from '~/data/Resume';
import ProfilePicture from '~/assets/images/me.jpg';

export default function HomePage() {
    return (
        <main className='mx-auto grid max-w-main space-y-16 px-6 md:h-screen md:grid-rows-3 md:space-y-0 xl:px-0'>
            <div>
                <Navbar />
            </div>

            <div className='flex flex-col-reverse justify-between xl:flex-row'>
                <div className='my-auto mt-10 grid justify-center space-y-3 xl:mt-auto'>
                    <h1 className='text-center text-5xl font-semibold tracking-wide text-white lg:text-7xl'>{Resume.basics.title}</h1>
                    <span className='bg-gradient-indigo text-center text-2xl font-semibold tracking-widest xl:text-start'>{Resume.basics.role}</span>
                </div>

                <Image className='self-center rounded-2xl sm:max-w-lg xl:mx-0 xl:self-auto' src={ProfilePicture} alt='Profile picture' priority />
            </div>

            <div className='self-end pb-10'>
                <SocialMediaSection />
            </div>
        </main>
    );
}
