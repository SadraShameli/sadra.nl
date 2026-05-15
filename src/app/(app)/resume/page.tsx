import { type Metadata } from 'next';

import { resumeContent } from '~/lib/content';

import ResumeContent from '../_components/Resume/Resume';

export const metadata: Metadata = {
    description: resumeContent.metaDescription,
    title: resumeContent.metaTitle,
};

export default function ResumePage() {
    return (
        <main className={`app-resume container grid w-full pt-spacing`}>
            <div className="my-content mx-auto">
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
