import Resume from '~/data/Resume';
import Sidebar from '../components/Sidebar';

export default function AboutPage() {
    return (
        <main className='my-56 px-6 xl:px-0'>
            <Sidebar />

            <div className='rounded-2xl max-w-main mx-auto space-y-10 border p-10'>
                {Resume.keypoints.map((skills, index) => {
                    return (
                        <div key={index}>
                            <h2 className='bg-gradient-indigo text-xl font-semibold'>{skills.title}</h2>
                            <p className='mt-3 whitespace-pre-line text-justify'>{skills.summary}</p>
                            <ul className='mt-3 space-y-3'>
                                {skills.keywords.map((skill, index) => {
                                    return (
                                        <li key={index}>
                                            <span className='mr-2'>+</span>
                                            {skill}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    );
                })}
            </div>
        </main>
    );
}
