import SectionTitle from '~/components/SectionTitle';
import type { ResumeSectionView } from '~/lib/cms';

import ResumeItem from './ResumeItem';

export type ResumeContentProps = {
    projectsSectionTitle: string;
    experienceSectionTitle: string;
    educationSectionTitle: string;
    projects: ResumeSectionView[];
    experience: ResumeSectionView[];
    education: ResumeSectionView[];
};

export default function ResumeContent({
    projectsSectionTitle,
    experienceSectionTitle,
    educationSectionTitle,
    projects,
    experience,
    education,
}: ResumeContentProps) {
    return (
        <div className="grid gap-y-10">
            <section>
                <SectionTitle text={projectsSectionTitle} />
                <ResumeItem title="Projects" sections={projects} />
            </section>

            <section className="pt-spacing">
                <SectionTitle text={experienceSectionTitle} />
                <ResumeItem title="Experience" sections={experience} />
            </section>

            <section className="pt-spacing">
                <SectionTitle text={educationSectionTitle} />
                <ResumeItem title="Education" sections={education} />
            </section>
        </div>
    );
}
