import Resume from '~/data/Resume';
import Navbar from '../components/Navbar';

export default function AboutPage() {
    return (
        <main className='mx-auto grid max-w-main px-6 md:h-screen xl:px-0'>
            <div>
                <Navbar />
            </div>

            <div className='py-20'>
                <div className='max-w-main space-y-10 rounded-2xl border p-5 xl:p-10'>
                    {Resume.keypoints.map((skills, index) => {
                        return (
                            <div key={index}>
                                <h2 className='bg-gradient-indigo text-2xl font-light tracking-tight max-w-fit'>{skills.title}</h2>
                                <p className='mt-3 whitespace-pre-line text-justify tracking-tight'>{skills.summary}</p>
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
            </div>
        </main>
    );
}
