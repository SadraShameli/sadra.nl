import RevealAnimation from '~/components/ui/Animations/Reveal';
import StaggerAnimation from '~/components/ui/Animations/Stagger';
import Card from '~/components/ui/Card';
import Resume from '~/data/Resume';

export default function AboutSection() {
    return (
        <RevealAnimation>
            <Card>
                <div className='grid gap-y-20'>
                    {Resume.keypoints.map((skills, index) => {
                        return (
                            <StaggerAnimation key={index}>
                                <h2 className='bg-gradient-emerald-anim max-w-fit text-2xl font-semibold'>{skills.title}</h2>

                                <p className='mt-3 whitespace-pre-line text-justify tracking-tight'>{skills.summary}</p>

                                <ul className='mt-3 grid gap-y-3'>
                                    {skills.keywords.map((skill, index) => {
                                        return (
                                            <li key={index}>
                                                <span className='mr-2'>+</span>
                                                {skill}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </StaggerAnimation>
                        );
                    })}
                </div>
            </Card>
        </RevealAnimation>
    );
}
