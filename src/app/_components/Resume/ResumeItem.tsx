import { CalendarDays, Cog, ExternalLink, MapPin } from 'lucide-react';
import Image, { type StaticImageData } from 'next/image';
import Link from 'next/link';

import RevealAnimation from '~/components/ui/Animations/Reveal';
import StaggerAnimation from '~/components/ui/Animations/Stagger';
import Card from '~/components/ui/Card';

import { type IResumeSection } from './ResumeTypes';

interface ResumeProps {
    title: string;
    sections: IResumeSection[];
    img: StaticImageData;
}

export default function ResumeItem({ title, sections, img }: ResumeProps) {
    return (
        <RevealAnimation>
            <Card>
                <StaggerAnimation className="mx-auto grid grid-cols-1 xl:grid-cols-2 xl:gap-x-10">
                    <Image
                        className="rounded-2xl"
                        src={img}
                        alt={`${title} picture`}
                    />

                    <div className="grid gap-y-10">
                        {sections.map((section, index) => {
                            return (
                                <div key={index}>
                                    <div className="mt-8 flex flex-col justify-between md:flex-row md:items-center">
                                        <Link
                                            className="flex w-fit items-center border-b border-dashed border-transparent text-2xl font-semibold leading-none text-white transition hover:border-current"
                                            href={section.url}
                                        >
                                            <ExternalLink />
                                            <span className="pl-2">
                                                {section.title}
                                            </span>
                                        </Link>

                                        <span className="bg-gradient-purple-anim mt-1 text-lg font-semibold md:mt-auto">
                                            {section.role}
                                        </span>
                                    </div>

                                    <div className="mt-5 grid gap-y-2 text-neutral-400">
                                        {section.location && (
                                            <Link
                                                className="flex w-fit items-center transition hover:text-white"
                                                href={section.location.url}
                                            >
                                                <MapPin className="size-5" />
                                                <span className="ml-1 tracking-tight">
                                                    {section.location.title}
                                                </span>
                                            </Link>
                                        )}

                                        <div className="flex items-center">
                                            <CalendarDays className="size-5" />
                                            <span className="ml-1 leading-none tracking-tight">
                                                {section.date}
                                            </span>
                                        </div>
                                    </div>

                                    {section.summary && (
                                        <p className="mt-7 border-t pt-7">
                                            {section.summary}
                                        </p>
                                    )}

                                    {section.highlights && (
                                        <ul className="mt-2 grid gap-y-3">
                                            {section.highlights.map(
                                                (highlight, index) => {
                                                    return (
                                                        <li
                                                            className="flex text-justify"
                                                            key={index}
                                                        >
                                                            <span className="mr-2">
                                                                +
                                                            </span>
                                                            {highlight}
                                                        </li>
                                                    );
                                                },
                                            )}
                                        </ul>
                                    )}

                                    {section.skills && (
                                        <div className="mt-5 flex items-center">
                                            <Cog className="size-5" />
                                            <ul className="ml-2 flex">
                                                {section.skills.map(
                                                    (skill, index) => {
                                                        return (
                                                            <li key={index}>
                                                                {skill}
                                                            </li>
                                                        );
                                                    },
                                                )}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </StaggerAnimation>
            </Card>
        </RevealAnimation>
    );
}
