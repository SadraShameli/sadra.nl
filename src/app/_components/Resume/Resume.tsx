import SectionTitle from '~/components/SectionTitle';
import resumeSadra from '~/data/Resume/Sadra';
import ResumeItem from './ResumeItem';

export default function ResumeSection() {
    return (
        <div className="grid gap-y-10">
            <section>
                <SectionTitle text="Recent projects" />
                <ResumeItem title="Projects" sections={resumeSadra.projects} />
            </section>

            <section className="pt-spacing">
                <SectionTitle text="Work experience" />
                <ResumeItem
                    title="Experience"
                    sections={resumeSadra.experience}
                />
            </section>

            <section className="pt-spacing">
                <SectionTitle text="Education" />
                <ResumeItem
                    title="Education"
                    sections={resumeSadra.education}
                />
            </section>
        </div>
    );
}
