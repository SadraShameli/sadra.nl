import { type Metadata } from 'next';

import { resumeContent } from '~/lib/content';

import ResumeContent from '../_components/Resume/Resume';

export const metadata: Metadata = {
    title: resumeContent.metaTitle,
    description: resumeContent.metaDescription,
};

export default function ResumePage() {
    return (
        <main className="container grid w-full pt-spacing">
            <div className="my-content mx-auto">
                <ResumeContent
                    projectsSectionTitle={resumeContent.projectsSectionTitle}
                    experienceSectionTitle={
                        resumeContent.experienceSectionTitle
                    }
                    educationSectionTitle={resumeContent.educationSectionTitle}
                    projects={resumeContent.projects}
                    experience={resumeContent.experience}
                    education={resumeContent.education}
                />
            </div>
        </main>
    );
}
