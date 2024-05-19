import Image from 'next/image';

import ProfilePicture from '~/assets/images/me.jpg';
import RevealAnimation from '~/components/ui/Animations/Reveal';
import Card from '~/components/ui/Card';
import Resume from '~/data/Resume';

import GallerySection from './GallerySection';

export default function AboutSection() {
    return (
        <RevealAnimation>
            <>
                <Card>
                    <div className="grid gap-y-10">
                        <GallerySection />
                        <div className="flex items-center gap-x-5">
                            <Image
                                className="hidden size-10 rounded-full sm:inline"
                                src={ProfilePicture}
                                alt={'Profile picture'}
                            />
                            <h2 className="text-justify sm:border-l sm:pl-6">
                                {Resume.basics.summary}
                            </h2>
                        </div>
                        {/* <ul className='mt-3 grid gap-y-3'>
                                    {skills.keywords.map((skill, index) => {
                                        return (
                                            <li key={index}>
                                            <span className='mr-2'>+</span>
                                            {skill}
                                            </li>
                                        );
                                    })}
                                </ul> */}
                    </div>
                </Card>
            </>
        </RevealAnimation>
    );
}
