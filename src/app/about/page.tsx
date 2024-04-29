import Resume from '~/data/Resume';
import Navbar from '../components/Navbar';
import styles from './styles.module.css';

export default function AboutPage() {
    return (
        <main className='mx-auto grid max-w-main space-y-16 px-6 md:h-screen md:space-y-0 xl:px-0'>
            <div>
                <Navbar />
            </div>

            <div>
                <div className='max-w-main space-y-10 rounded-2xl border p-5 xl:p-10'>
                    {Resume.keypoints.map((skills, index) => {
                        return (
                            <div key={index}>
                                <h2 className='bg-gradient-indigo text-2xl font-semibold'>{skills.title}</h2>
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
            </div>
        </main>
    );
}
