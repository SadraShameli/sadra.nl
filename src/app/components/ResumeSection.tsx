import Link from 'next/link';
import Image, { StaticImageData } from 'next/image';

import CalendarIcon from '~/components/Icons/Calendar';
import MapIcon from '~/components/Icons/Map';

import { IResumeSection } from '~/types/Resume';

export default function ResumeSection({ title, sections, img }: { title: string; sections: IResumeSection[]; img: StaticImageData }) {
    return (
        <div className='max-w-main rounded-2xl mx-auto grid grid-cols-1 border p-5 xl:grid-flow-col xl:grid-cols-2 xl:space-x-10 xl:p-10' id={title}>
            <Image className='rounded-2xl' src={img} alt={`${title} picture`} quality={100} priority />

            <div className='space-y-10'>
                {sections.map((section, index) => {
                    return (
                        <div className='text-sm' key={index}>
                            <div className='flex justify-between'>
                                <div className='grid space-y-3 xl:inline-block'>
                                    <Link className='mt-10 w-fit border-b border-dashed border-current text-2xl font-semibold text-white' href={section.url}>
                                        {section.title}
                                    </Link>

                                    {<span className='text-base xl:ml-5 xl:border-l xl:pl-5'>{section.role}</span>}

                                    <div className='mt-3 grid gap-y-2 text-[#888]'>
                                        {section.location && (
                                            <Link className='flex items-center' href={section.location.url}>
                                                <MapIcon className='h-5 w-5' />
                                                <span className='ml-1'>{section.location.title}</span>
                                            </Link>
                                        )}

                                        <div className='flex items-center'>
                                            <CalendarIcon className='h-5 w-5' />
                                            <span className='ml-1'>{section.date}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <p className='mt-5'>{section.summary}</p>

                            {section.highlights && (
                                <ul className='mt-2 space-y-3'>
                                    {section.highlights.map((highlight, index) => {
                                        return (
                                            <li className='flex text-justify' key={index}>
                                                <span className='mr-2'>•</span>
                                                {highlight}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}

                            {section.skills && (
                                <div className='mt-5 flex'>
                                    <span>Skills:</span>
                                    <ul className='ml-1 flex'>
                                        {section.skills.map((skill, index) => {
                                            return <li key={index}>{skill}</li>;
                                        })}
                                    </ul>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
