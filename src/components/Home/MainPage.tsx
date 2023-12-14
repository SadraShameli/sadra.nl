import Link from 'next/link';
import Image from 'next/image';

import { type IResumeSection, type IResume } from '../../types/Resume';
import MapIcon from '../Icons/Map';
import StackIcon from '../Icons/Stack';
import WorkBagIcon from '../Icons/WorkBag';
import CalendarIcon from '../Icons/Calendar';
import EducationIcon from '../Icons/Education';
import ProfilePicture from '~/assets/img/me.jpg';

export default function MainPage(resume: IResume) {
    return (
        <main className='relative z-[9999] mx-auto flex max-w-9xl flex-col xl:flex-row'>
            <div className='mx-5 my-20 lg:m-16'>
                <div className='flex flex-1 flex-col items-center justify-between gap-x-5 lg:flex-row'>
                    <div className='flex flex-col lg:flex-row'>
                        <div className='relative mx-auto h-28 w-28 lg:h-20 lg:w-20'>
                            <Image className='rounded' src={ProfilePicture} alt='Profile picture' quality={100} priority />
                        </div>

                        <div className='mt-5 text-center lg:my-auto lg:ml-5 lg:pt-0 lg:text-left'>
                            <h1 className='text-3xl font-bold'>{resume.basics.title}</h1>
                            <p>{resume.basics.role}</p>
                        </div>
                    </div>

                    <div className='mt-6 flex items-center justify-center gap-x-3'>
                        {resume.basics.profiles.map((profile, index) => {
                            return (
                                <Link className='h-5 w-5 hover:text-hover' href={profile.url} title={profile.title} key={index}>
                                    {profile.icon}
                                </Link>
                            );
                        })}
                    </div>
                </div>

                <div className='mt-16 space-y-7 divide-y border-t'>
                    <GenerateResumeSection title='Work' icon={<WorkBagIcon />} section={resume.works} />

                    <GenerateResumeSection title='Projects' icon={<StackIcon />} section={resume.projects} />

                    <GenerateResumeSection title='Education' icon={<EducationIcon />} section={resume.educations} />
                </div>
            </div>

            <div className='mx-5 my-10 space-y-5 text-sm lg:m-16 lg:my-20 xl:border-l xl:pl-14'>
                <div>
                    <h2 className='text-xl font-semibold '>About</h2>
                    <p className='mt-3 whitespace-pre-line text-justify'>{resume.basics.summary}</p>

                    {resume.works[0]?.location && (
                        <Link className='mt-4 flex items-center text-[#888] hover:text-hover' href={resume.works[0].location.url}>
                            <MapIcon className='h-5 w-5' />
                            <span className='ml-1'>{resume.works[0].location.title}</span>
                        </Link>
                    )}
                </div>

                {resume.skills.map((skills, index) => {
                    return (
                        <div key={index}>
                            <h2 className='text-xl font-semibold'>{skills.title}</h2>
                            <ul className='mt-3 space-y-3'>
                                {skills.keywords.map((skill, index) => {
                                    return (
                                        <li key={index}>
                                            <span className='mr-2'>•</span>
                                            {skill}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    );
                })}

                <div>
                    <h2 className='text-xl font-semibold'>Languages</h2>
                    <div className='mt-3 space-y-3'>
                        {resume.languages.map((language, index) => {
                            return (
                                <ul key={index}>
                                    <li>
                                        <span className='mr-2'>•</span>
                                        {language.language} - {language.fluency}
                                    </li>
                                </ul>
                            );
                        })}
                    </div>
                </div>
            </div>
        </main>
    );
}

function GenerateResumeSection({ title, icon, section: sections }: { title: string; icon: JSX.Element; section: IResumeSection[] }) {
    return (
        <div>
            <div className='flex items-center py-7'>
                <div className='h-8 w-8'>{icon}</div>
                <h2 className='ml-3 text-xl font-semibold'>{title}</h2>
            </div>

            <div className='space-y-5'>
                {sections.map((section, index) => {
                    return (
                        <div className='text-sm' key={index}>
                            <div className='text-base'>
                                <Link
                                    className='border-b border-dashed border-current font-semibold hover:border-hover hover:text-hover dark:border-white'
                                    href={section.url}
                                >
                                    {section.title}
                                </Link>
                                {section.role && <span>, {section.role}</span>}
                            </div>

                            <div className='mt-2 flex flex-wrap gap-x-5 gap-y-2 text-[#888]'>
                                {section.location && (
                                    <Link className='flex items-center hover:text-hover' href={section.location.url}>
                                        <MapIcon className='h-5 w-5' />
                                        <span className='ml-1'>{section.location.title}</span>
                                    </Link>
                                )}

                                <div className='flex items-center'>
                                    <CalendarIcon className='h-5 w-5' />
                                    <span className='ml-1'>{section.date}</span>
                                </div>
                            </div>

                            <p className='mt-3'>{section.summary}</p>

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
