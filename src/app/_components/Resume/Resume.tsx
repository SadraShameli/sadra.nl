import diplomaImg from '~/assets/images/diploma.jpg';
import projectAiImg from '~/assets/images/projectai.jpg';
import workImg from '~/assets/images/units.jpg';
import Resume from '~/data/Resume';

import ResumeItem from './ResumeItem';

export default function ResumeSection() {
    return (
        <div className="grid gap-y-10">
            <ResumeItem
                title="Projects"
                img={projectAiImg}
                sections={Resume.projects}
            />

            <ResumeItem title="Work" img={workImg} sections={Resume.works} />

            <ResumeItem
                title="Education"
                img={diplomaImg}
                sections={Resume.educations}
            />
        </div>
    );
}
