import Image, { type StaticImageData } from 'next/image';
import Link from 'next/link';

import Card from '~/components/Card';
import CalendarIcon from '~/components/Icons/Calendar';
import LinkIcon from '~/components/Icons/Link';
import MapIcon from '~/components/Icons/Map';
import { type IResumeSection } from '~/types/Resume';

interface ResumeProps {
    title: string;
    sections: IResumeSection[];
    img: StaticImageData;
}

export default function ResumeItem({ title, sections, img }: ResumeProps) {
    return (
        <Card>
            <div className='mx-auto grid grid-cols-1 xl:grid-flow-col xl:grid-cols-2 xl:space-x-10'>
                <Image className='rounded-2xl' src={img} alt={`${title} picture`} />

                <div className='space-y-10'>
                    {sections.map((section, index) => {
                        return (
                            <div key={index}>
                                <div className='mt-8 flex flex-col justify-between md:flex-row md:items-center'>
                                    <Link
                                        className='flex w-fit items-center border-b border-dashed border-transparent text-2xl font-semibold leading-none text-white transition hover:border-current'
                                        href={section.url}
                                    >
                                        <span>{section.title}</span>
                                        <LinkIcon className='ml-1 size-6' />
                                    </Link>

                                    <span className='bg-gradient-emerald-anim mt-1 text-lg font-semibold md:mt-auto'>{section.role}</span>
                                </div>

                                <div className='mt-5 grid gap-y-1 text-neutral-500'>
                                    {section.location && (
                                        <Link className='flex items-center transition hover:text-white' href={section.location.url}>
                                            <MapIcon className='size-5' />
                                            <span className='ml-1 tracking-tight'>{section.location.title}</span>
                                        </Link>
                                    )}

                                    <div className='flex items-center'>
                                        <CalendarIcon className='size-5' />
                                        <span className='ml-1 tracking-tight'>{section.date}</span>
                                    </div>
                                </div>

                                {section.summary && <p className='mt-7 border-t pt-7'>{section.summary}</p>}

                                {section.highlights && (
                                    <ul className='mt-2 space-y-3'>
                                        {section.highlights.map((highlight, index) => {
                                            return (
                                                <li className='flex text-justify' key={index}>
                                                    <span className='mr-2'>+</span>
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
        </Card>
    );
}
