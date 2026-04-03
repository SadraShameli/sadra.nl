import { type Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getResumeGlobal, isResumeComplete, mapResumeEntry } from '~/lib/cms';

import ResumeContent from '../_components/Resume/Resume';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
    const resume = await getResumeGlobal();
    if (!isResumeComplete(resume)) {
        return {};
    }
    return {
        title: resume.metaTitle,
        description: resume.metaDescription,
    };
}

export default async function ResumePage() {
    const resume = await getResumeGlobal();
    if (!isResumeComplete(resume)) {
        notFound();
    }

    return (
        <main className="pt-spacing container grid w-full">
            <div className="my-content mx-auto">
                <ResumeContent
                    projectsSectionTitle={resume.projectsSectionTitle}
                    experienceSectionTitle={resume.experienceSectionTitle}
                    educationSectionTitle={resume.educationSectionTitle}
                    projects={resume.projects.map(mapResumeEntry)}
                    experience={resume.experience.map(mapResumeEntry)}
                    education={resume.education.map(mapResumeEntry)}
                />
            </div>
        </main>
    );
}
