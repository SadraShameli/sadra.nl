import parse from 'html-react-parser';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { SectionTone } from '~/app/(app)/_components/SectionShell';
import { Button } from '~/components/ui/button';
import { TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { featuredPortfolioProjects, homepageContent } from '~/lib/site/content';
import { HomeSectionId } from '~/lib/site/homeSections';
import { routes } from '~/lib/site/routes';

import { HomeSectionShell } from './HomeSectionShell';
import { PortfolioProjectTabs } from './PortfolioProjectTabs';
import { SectionIntro } from './SectionIntro';

export function PortfolioShowcaseSection() {
    const { body, heading, linkLabel, projectLinkLabel, selectorLabel } =
        homepageContent.portfolio;

    return (
        <HomeSectionShell
            id={HomeSectionId.Portfolio}
            tone={SectionTone.Ground}
        >
            <SectionIntro body={body} heading={heading} />

            <PortfolioProjectTabs>
                <div className="flex flex-wrap items-center justify-between gap-6">
                    <TabsList
                        aria-label={selectorLabel}
                        className="grid h-auto w-full grid-cols-2 gap-1 md:w-fit md:grid-cols-4"
                    >
                        {featuredPortfolioProjects.map(({ id, project }) => (
                            <TabsTrigger
                                className="min-h-11 min-w-0 px-3 md:px-6"
                                key={id}
                                value={id}
                            >
                                {project.title}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                    <Button asChild className="ml-auto w-fit" variant="outline">
                        <Link href={routes.portfolio}>
                            {linkLabel}
                            <ArrowRight aria-hidden data-icon="inline-end" />
                        </Link>
                    </Button>
                </div>

                {featuredPortfolioProjects.map(({ id, photo, project }) => (
                    <TabsContent
                        className="group mt-0 overflow-hidden rounded-xl border border-line bg-surface motion-reduce:animate-none"
                        key={id}
                        value={id}
                    >
                        <div className="grid lg:grid-cols-[1.2fr_1fr]">
                            <div className="relative flex min-w-0 items-center overflow-hidden bg-surface-raised p-7 md:p-12">
                                <div
                                    aria-hidden
                                    className="pointer-events-none absolute inset-0 mesh-dots"
                                />
                                <figure className="relative m-0 flex w-full flex-col gap-6">
                                    <div className="relative aspect-16/10 -rotate-3 overflow-hidden rounded-lg border border-line-strong bg-ground transition-transform duration-500 group-focus-within:rotate-0 group-hover:rotate-0 motion-reduce:transform-none motion-reduce:transition-none">
                                        <Image
                                            alt={photo.alt}
                                            className="object-cover object-top"
                                            fill
                                            placeholder="blur"
                                            sizes="(min-width: 1400px) 650px, (min-width: 1024px) 50vw, 90vw"
                                            src={photo.image}
                                        />
                                    </div>
                                    <figcaption className="flex items-center justify-between gap-4 type-micro text-ink-muted">
                                        <span>{photo.caption}</span>
                                        <span className="text-camel">
                                            {photo.tag}
                                        </span>
                                    </figcaption>
                                </figure>
                            </div>

                            <div className="flex min-w-0 flex-col justify-center gap-6 p-6 md:p-10 lg:min-h-110">
                                <div className="flex flex-col gap-3">
                                    <span className="type-micro text-ink-muted">
                                        {project.date}
                                    </span>
                                    <h3 className="m-0 type-display-page text-ink">
                                        {project.title}
                                    </h3>
                                    {project.role ? (
                                        <p className="m-0 type-small text-camel">
                                            {project.role}
                                        </p>
                                    ) : null}
                                </div>
                                {project.summary ? (
                                    <p className="m-0 type-body text-ink-soft">
                                        {parse(project.summary)}
                                    </p>
                                ) : null}
                                {project.url ? (
                                    <Button
                                        asChild
                                        className="w-fit"
                                        variant="outline"
                                    >
                                        <Link
                                            href={project.url}
                                            rel="noreferrer"
                                            target="_blank"
                                        >
                                            {projectLinkLabel}
                                            <ArrowUpRight
                                                aria-hidden
                                                data-icon="inline-end"
                                            />
                                        </Link>
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    </TabsContent>
                ))}
            </PortfolioProjectTabs>
        </HomeSectionShell>
    );
}
