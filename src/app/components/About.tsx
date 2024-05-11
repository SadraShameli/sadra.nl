import RevealAnimation from '~/components/Animations/Reveal';
import StaggerAnimation from '~/components/Animations/Stagger';
import Card from '~/components/Card';
import Resume from '~/data/Resume';

export default function About() {
    return (
        <>
            <RevealAnimation>
                <h2 className='xl:text-7x pb-16 text-center text-4xl font-semibold text-white md:text-6xl'>More about me</h2>
            </RevealAnimation>

            <RevealAnimation>
                <Card>
                    <StaggerAnimation className='space-y-20'>
                        {Resume.keypoints.map((skills, index) => {
                            return (
                                <div key={index}>
                                    <h2 className='bg-gradient-emerald-anim max-w-fit text-2xl font-semibold'>{skills.title}</h2>

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
                    </StaggerAnimation>
                </Card>
            </RevealAnimation>
        </>
    );
}
