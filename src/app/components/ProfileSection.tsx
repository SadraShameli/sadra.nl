import Image from 'next/image';

import SocialMediaSection from './SocialMediaSection';

import Resume from '~/data/Resume';
import ProfilePicture from '~/assets/images/me.jpg';

export default function ProfileSection() {
    return (
        <div>
            <div className='max-w-main mx-auto flex w-full flex-col-reverse justify-between px-6 xl:flex-row xl:px-0'>
                <div className='my-auto mt-14 grid justify-center space-y-3 xl:mt-auto'>
                    <h1 className='text-center text-5xl font-semibold tracking-wide text-white lg:text-7xl'>{Resume.basics.title}</h1>
                    <span className='bg-gradient-indigo text-center text-2xl font-semibold tracking-widest xl:text-start'>{Resume.basics.role}</span>
                </div>

                <Image className='rounded-2xl mx-auto sm:max-w-xl xl:mx-0' src={ProfilePicture} alt='Profile picture' quality={100} priority />
            </div>

            <SocialMediaSection />
        </div>
    );
}
