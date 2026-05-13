import type { ResumeSectionView } from '~/lib/content';

import SectionTitle from '~/components/SectionTitle';

import ResumeItem from './ResumeItem';

export type ResumeContentProps = {
    education: ResumeSectionView[];
    educationSectionTitle: string;
    experience: ResumeSectionView[];
    experienceSectionTitle: string;
    projects: ResumeSectionView[];
    projectsSectionTitle: string;
};

export default function ResumeContent({
    education,
    educationSectionTitle,
    experience,
    experienceSectionTitle,
    projects,
    projectsSectionTitle,
}: ResumeContentProps) {
    return (
        <div className="grid gap-y-10">
            <section>
                <SectionTitle text={projectsSectionTitle} />
                <ResumeItem sections={projects} title="Projects" />
            </section>

            <section className="pt-spacing">
                <SectionTitle text={experienceSectionTitle} />
                <ResumeItem sections={experience} title="Experience" />
            </section>

            <section className="pt-spacing">
                <SectionTitle text={educationSectionTitle} />
                <ResumeItem sections={education} title="Education" />
            </section>
        </div>
    );
}
