import SectionText from '~/components/SectionText';
import ResumeItem from './ResumeItem';
import resumeSadra from '~/data/Resume/Sadra';

export default function ResumeSection() {
    return (
        <div className="grid gap-y-10">
            <div>
                <SectionText text="Recent projects" />
                <ResumeItem title="Projects" sections={resumeSadra.projects} />
            </div>

            <div className="mt-content">
                <SectionText text="Work experience" />
                <ResumeItem title="Experience" sections={resumeSadra.experience} />
            </div>

            <div className="mt-content">
                <SectionText text="Education" />
                <ResumeItem title="Education" sections={resumeSadra.education} />
            </div>
        </div>
    );
}
