import Resume from '~/data/Resume';
import Sidebar from '../components/Sidebar';
import ResumeSection from '../components/ResumeSection';

import workImg from '~/assets/images/units.jpg';
import diplomaImg from '~/assets/images/diploma.jpg';
import projectAiImg from '~/assets/images/projectai.jpg';

export default function ProfilePage() {
    return (
        <main className='my-56 px-6 xl:px-0'>
            <Sidebar />

            <div className='space-y-4'>
                <ResumeSection title='Work' img={workImg} sections={Resume.works} />

                <ResumeSection title='Projects' img={projectAiImg} sections={Resume.projects} />

                <ResumeSection title='Education' img={diplomaImg} sections={Resume.educations} />
            </div>
        </main>
    );
}
