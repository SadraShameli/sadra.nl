import GithubIcon from '~/components/ui/Icons/Github';
import InstagramIcon from '~/components/ui/Icons/Instagram';
import WhatsAppIcon from '~/components/ui/Icons/WhatsApp';
import YoutubeIcon from '~/components/ui/Icons/Youtube';
import { type IResume } from '~/types/Resume';

function calculate_age(dob: Date) {
    const diff_ms = Date.now() - dob.getTime();
    const age_dt = new Date(diff_ms);

    return Math.abs(age_dt.getUTCFullYear() - 1970);
}

const birthday = new Date('2003-12-11');
const age = calculate_age(birthday);

const Resume: IResume = {
    title: 'Sadra',
    description: 'Futures trader  //  Software Developer',
    basics: {
        firstName: 'Sadra',
        lastName: 'Shameli',
        title: 'Sadra Shameli',
        email: 'sadra.shameli1@gmail.com',
        phone: '+31685156033',
        location: {
            title: 'Rotterdam - South Holland, The Netherlands',
            url: 'https://goo.gl/maps/v9asMxGqgKwcvwQw5',
        },
        profiles: [
            {
                title: 'Youtube',
                url: 'https://youtube.com/@sadrashameli',
                icon: <YoutubeIcon />,
            },
            {
                title: 'Github',
                url: 'https://github.com/SadraShameli',
                icon: <GithubIcon />,
            },
            {
                title: 'WhatsApp',
                url: 'https://wa.me/+31685156033',
                icon: <WhatsAppIcon />,
            },
            {
                title: 'Instagram',
                url: 'https://instagram.com/sadra_shml',
                icon: <InstagramIcon />,
            },
            // {
            //     title: 'Gmail',
            //     url: 'mailto:sadra.shameli1@gmail.com',
            //     icon: <GmailIcon />,
            // },
            // {
            //     title: 'Linkedin',
            //     url: 'https://www.linkedin.com/in/sadrashameli/',
            //     icon: <LinkedinIcon />,
            // },
        ],
    },
    keypoints: [
        {
            title: 'About',
            summary: `I am Sadra Shameli. ${age} y/o full-stack & embedded engineer with two years of working experience, based in Rotterdam, the Netherlands. My tech stack consists of TypeScript, React and Next.js together with Tailwind CSS, tRPC, Prisma and NextAuth.js to develop intuitive web applications. I am also experienced in developing robots and IoT devices.`,
            keywords: [],
        },
        {
            title: 'Skills',
            keywords: [
                'TypeScript, React and Next.js',
                'tRPC, Prisma, NextAuth.js',
                'Tailwind CSS, Daisy UI and Material UI',
                'ASP.NET, Unit testing. Familiar with REST API, Web API and MVC.',
                'Relational databases such as PostgreSQL, SQL Server',
                'C - C++, Python 3',
            ],
        },
        {
            title: 'Interests',
            keywords: ['Robotics', 'Programming', 'Photography', 'Guitar', 'Cars'],
        },
        {
            title: 'Languages',
            keywords: ['English & Dutch • Full Professional Proficiency', 'Persian • Native Speaker'],
        },
    ],
    works: [
        {
            role: 'Full-Stack & Embedded',
            date: 'Jan 2022 - Jan 2023',
            title: 'Blue Star Planning',
            url: 'https://bluestarplanning.com',
            location: {
                title: 'Rotterdam, The Netherlands',
                url: 'https://goo.gl/maps/v9asMxGqgKwcvwQw5',
            },
            summary: 'Blue Star Planning is specialized in the development and realization of Advanced Planning and Scheduling systems.',
            highlights: [
                'Developed various IoT devices including 3D printing. Intended to gather various data, such as sound recordings, loudness, temperature and humidity, air quality and RPM values. The devices are placed at different locations in The Netherlands.',
                'Developed the back-end to process the data gathered by the devices as well as the front-end, where the sound recordings and loudness values are available.',
            ],
            skills: ['React ··· TypeScript ··· Material UI ··· ASP.NET ··· SQL'],
        },
    ],
    projects: [
        {
            title: 'Project A.I.',
            date: 'Sep 2022 - Dec 2022',
            url: 'https://github.com/SadraShameli/ProjectAI',
            summary: 'Autonomous self-driving robot based on camera vision and lidar.',
            role: 'Robot',
            highlights: [
                'Fully autonomous driving without any input from the user',
                'Ability to manually control using a PS4 or PS5 controller',
                'Making use of the well-proven machine learning library TensorFlow',
                'Using multithreading for every core functionality',
            ],
            skills: ['3D Printing ··· Machine Learning ··· C++ ··· Python'],
        },
        // {
        //     title: 'Partify',
        //     role: 'Website',
        //     date: 'Jan 2023 - Present',
        //     url: 'https://github.com/SadraShameli/Partify',
        //     summary: 'Online e-commerce store',
        //     skills: ['TypeScript, React, Next.js, Tailwind CSS, tRPC, Prisma, NextAuth.js, PostgreSQL'],
        // },
    ],
    educations: [
        {
            title: 'Grotius College',
            date: 'Sep 2020, Aug 2023',
            url: 'https://www.grotiuscollege.nl',
            role: 'VWO - N&T',
            summary: '',
        },
    ],
    languages: [
        {
            language: 'English',
            fluency: 'Full Professional Proficiency',
        },
        {
            language: 'Dutch',
            fluency: 'Full Professional Proficiency',
        },
        {
            language: 'Persian',
            fluency: 'Native speaker',
        },
    ],
};

export default Resume;
