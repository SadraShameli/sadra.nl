import Resume from '~/data/Resume';
import Navbar from '../components/Navbar';
import ResumeSection from '../components/ResumeSection';

import workImg from '~/assets/images/units.jpg';
import diplomaImg from '~/assets/images/diploma.jpg';
import projectAiImg from '~/assets/images/projectai.jpg';

export default function ProfilePage() {
    return (
        <main className='mx-auto max-w-main px-6 xl:px-0'>
            <Navbar />

            <div className='my-20 space-y-4'>
                <ResumeSection title='Work' id='work' img={workImg} sections={Resume.works} />

                <ResumeSection title='Projects' id='projects' img={projectAiImg} sections={Resume.projects} />

                <ResumeSection title='Education' id='education' img={diplomaImg} sections={Resume.educations} />
            </div>
        </main>
    );
}
