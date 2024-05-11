import diplomaImg from '~/assets/images/diploma.jpg';
import projectAiImg from '~/assets/images/projectai.jpg';
import workImg from '~/assets/images/units.jpg';
import RevealAnimation from '~/components/Animations/Reveal';
import Resume from '~/data/Resume';

import ResumeItem from './Resume/ResumeItem';

export default function ResumeSection() {
    return (
        <>
            <RevealAnimation>
                <h2 className='xl:text-7x pb-16 text-center text-4xl font-semibold text-white md:text-6xl'>Recent projects</h2>
            </RevealAnimation>

            <RevealAnimation>
                <ResumeItem title='Work' img={workImg} sections={Resume.works} />
            </RevealAnimation>

            <RevealAnimation>
                <ResumeItem title='Projects' img={projectAiImg} sections={Resume.projects} />
            </RevealAnimation>

            <RevealAnimation>
                <ResumeItem title='Education' img={diplomaImg} sections={Resume.educations} />
            </RevealAnimation>
        </>
    );
}
