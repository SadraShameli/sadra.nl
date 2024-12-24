import parse from 'html-react-parser';
import {
    CalendarDays,
    ChevronRight,
    Cog,
    ExternalLink,
    MapPin,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { type IResumeSection } from '~/data/Resume/types';
import { cn } from '~/lib/utils';

import RevealAnimation from '~/components/ui/Animations/Reveal';
import { Card } from '~/components/ui/Card';

type ResumeProps = {
    title: string;
    sections: IResumeSection[];
};

export default function ResumeItem({ title, sections }: ResumeProps) {
    return (
        <RevealAnimation className="pt-spacing-inner">
            <Card className="container">
                <div className="mt-sp grid max-w-3xl gap-y-10 py-spacing-inner lg:py-0">
                    {sections.map((section, index) => {
                        return (
                            <div key={index}>
                                {section.image && (
                                    <div
                                        className={cn(
                                            index && 'border-t pt-12',
                                        )}
                                    >
                                        <Image
                                            className="mb-12 rounded-2xl"
                                            src={section.image}
                                            alt={`${title} picture`}
                                        />
                                    </div>
                                )}

                                <div
                                    className={cn(
                                        'flex flex-col justify-between lg:flex-row lg:items-center',
                                        index &&
                                            !section.image &&
                                            'border-t pt-12',
                                    )}
                                >
                                    {section.url ? (
                                        <Link
                                            className="flex w-fit items-center border-b border-dashed border-transparent text-2xl font-semibold leading-none text-white transition hover:border-current"
                                            href={section.url}
                                        >
                                            <ExternalLink />
                                            <span className="pl-2">
                                                {section.title}
                                            </span>
                                        </Link>
                                    ) : null}
                                    <span className="bg-gradient-neutral-anim mt-1 text-lg font-semibold lg:mt-auto">
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
                                            <span className="ml-1">
                                                {section.location.title}
                                            </span>
                                        </Link>
                                    )}

                                    <div className="flex items-center">
                                        <CalendarDays className="size-5" />
                                        <span className="ml-1 leading-none">
                                            {section.date}
                                        </span>
                                    </div>
                                </div>

                                {section.summary && (
                                    <p className="mt-7 border-t pt-7 text-justify">
                                        {parse(section.summary)}
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
                                                        <div className="mr-1 mt-[2px]">
                                                            <ChevronRight className="size-5" />
                                                        </div>
                                                        {highlight}
                                                    </li>
                                                );
                                            },
                                        )}
                                    </ul>
                                )}

                                {section.skills && (
                                    <div className="mt-5 flex items-center font-semibold">
                                        <Cog className="size-5 shrink-0" />
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
            </Card>
        </RevealAnimation>
    );
}
