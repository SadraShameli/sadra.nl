import diplomaImg from '~/assets/images/diploma.jpg';
import projectAiImg from '~/assets/images/projectai.jpg';
import workImg from '~/assets/images/units.jpg';
import Resume from '~/data/Resume';

import ResumeItem from './ResumeItem';
import SectionTitle from '../SectionTitle';

export default function ResumeSection() {
    return (
        <>
            <SectionTitle text='Recent projects' />

            <ResumeItem title='Work' img={workImg} sections={Resume.works} />

            <ResumeItem title='Projects' img={projectAiImg} sections={Resume.projects} />

            <ResumeItem title='Education' img={diplomaImg} sections={Resume.educations} />
        </>
    );
}
