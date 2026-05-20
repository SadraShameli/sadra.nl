import { type Metadata } from 'next';

import { resumeContent } from '~/lib/content';

import ResumeContent from '../_components/Resume/Resume';
import { PrintButton } from './PrintButton';

export const metadata: Metadata = {
    alternates: { canonical: '/resume' },
    description: resumeContent.metaDescription,
    openGraph: {
        description: resumeContent.metaDescription,
        title: resumeContent.metaTitle,
        type: 'profile',
        url: '/resume',
    },
    title: resumeContent.metaTitle,
};

export default function ResumePage() {
    return (
        <main className={`app-resume container grid w-full pt-spacing`}>
            <div className="my-content mx-auto">
                <div className="mb-4 flex justify-end print:hidden">
                    <PrintButton />
                </div>
                <ResumeContent
                    education={resumeContent.education}
                    educationSectionTitle={resumeContent.educationSectionTitle}
                    experience={resumeContent.experience}
                    experienceSectionTitle={
                        resumeContent.experienceSectionTitle
                    }
                    projects={resumeContent.projects}
                    projectsSectionTitle={resumeContent.projectsSectionTitle}
                />
            </div>
        </main>
    );
}
