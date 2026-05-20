import type { ResumeSectionView } from '~/lib/site/content';

import SectionTitle from '~/components/SectionTitle';
import { cn } from '~/lib/utils';

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
        <div className={cn('app-resume__content', 'grid gap-y-10')}>
            <section className={'app-resume__projects'}>
                <SectionTitle text={projectsSectionTitle} />
                <ResumeItem sections={projects} title="Projects" />
            </section>

            <section className={cn('app-resume__experience', 'pt-spacing')}>
                <SectionTitle text={experienceSectionTitle} />
                <ResumeItem sections={experience} title="Experience" />
            </section>

            <section className={cn('app-resume__education', 'pt-spacing')}>
                <SectionTitle text={educationSectionTitle} />
                <ResumeItem sections={education} title="Education" />
            </section>
        </div>
    );
}
