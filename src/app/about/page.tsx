import Resume from '~/data/Resume';
import Navbar from '../components/Navbar';

export default function AboutPage() {
    return (
        <main className='px-6 xl:px-0'>
            <Navbar />

            <div className='my-20 mx-auto max-w-main space-y-10 rounded-2xl border p-10'>
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
