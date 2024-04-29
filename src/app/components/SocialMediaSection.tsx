import Link from 'next/link';
import Resume from '~/data/Resume';

export default function SocialMediaSection() {
    return (
        <div className='mx-auto max-w-main'>
            {/* <h2 className='text-center text-5xl font-semibold text-white'>Follow me on Social Media</h2> */}

            <div className='grid gap-5 sm:grid-cols-2 lg:grid-cols-4'>
                {Resume.basics.profiles.map((profile, index) => {
                    return (
                        <div className='bg-gradient-card2 flex rounded-2xl px-5 text-white' key={index}>
                            <div className='pt-5'>
                                <Link href={profile.url}>
                                    <button className='hover:btn-scale btn-transition absolute rounded-lg bg-indigo-950 bg-opacity-50 px-3 py-2 text-xs font-semibold tracking-wider text-indigo-300 hover:bg-indigo-300 hover:text-indigo-950'>
                                        {profile.title}
                                    </button>
                                </Link>
                            </div>

                            <div className='mx-auto py-8 md:py-14'>
                                <Link href={profile.url}>
                                    <div className='h-14 w-14'>{profile.icon}</div>
                                </Link>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
