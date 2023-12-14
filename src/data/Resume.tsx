import { type IResume } from '~/types/Resume';

import GithubIcon from '~/components/Icons/Github';
import YoutubeIcon from '~/components/Icons/Youtube';
import LinkedinIcon from '~/components/Icons/Linkedin';
import GmailIcon from '~/components/Icons/Gmail';

function calculate_age(dob: Date) {
    var diff_ms = Date.now() - dob.getTime();
    var age_dt = new Date(diff_ms);

    return Math.abs(age_dt.getUTCFullYear() - 1970);
}

const birthday = new Date('2003-12-11');
const age = calculate_age(birthday);

const Resume: IResume = {
    title: 'Sadra Shameli • Resume',
    description: 'Full-Stack & Embedded Engineer',
    basics: {
        title: 'Sadra Shameli',
        role: 'Full-Stack & Embedded Engineer',
        email: 'sadra.shameli1@gmail.com',
        phone: '+31685156033',
        summary: `I am Sadra Shameli. ${age} y/o full-stack & embedded engineer with two years of working experience, based in Rotterdam, the Netherlands. My tech stack consists of TypeScript, React and Next.js together with Tailwind CSS, tRPC, Prisma and NextAuth.js to develop intuitive web applications. I am also experienced in developing robots and IoT devices.`,
        location: {
            title: 'Rotterdam - South Holland, The Netherlands',
            url: 'https://goo.gl/maps/v9asMxGqgKwcvwQw5',
        },
        profiles: [
            {
                title: 'Github',
                url: 'https://github.com/SadraShameli',
                icon: <GithubIcon />,
            },
            {
                title: 'Youtube',
                url: 'https://youtube.com/@sadrashameli',
                icon: <YoutubeIcon />,
            },
            {
                title: 'Linkedin',
                url: 'https://www.linkedin.com/in/sadrashameli/',
                icon: <LinkedinIcon />,
            },
            {
                title: 'Gmail',
                url: 'mailto:sadra.shameli1@gmail.com',
                icon: <GmailIcon />,
            },
        ],
    },
    skills: [
        {
            title: 'Skills',
            keywords: [
                'TypeScript, React and Next.js. Familiar with SSR, SSG and CSR.',
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
    ],
    works: [
        {
            role: 'Software Engineer',
            date: 'Jan 2022 - Jan 2023',
            title: 'Blue Star Planning',
            url: 'https://bluestarplanning.com',
            location: {
                title: 'Rotterdam, The Netherlands',
                url: 'https://goo.gl/maps/v9asMxGqgKwcvwQw5',
            },
            summary: 'Blue Star Planning is specialized in the development and realization of Advanced Planning and Scheduling systems.',
            highlights: [
                'Developed various IoT devices and 3D printing the casing. Intended to gather various data, such as sound recordings, loudness, temperature and humidity, air quality and RPM values. The sound recording go through IIR second-order section filtering and A-Weighting before saving. The devices are placed at different locations in Rotterdam.',
                'Developed the back-end to process the data gathered by the devices and developed the front-end at https://geluidsvervuiling.eu, where the sound recordings and loudness values are available depending on the device and the location.',
            ],
            skills: ['TypeScript, React, Material UI, ASP.NET, SQL Server'],
        },
    ],
    projects: [
        {
            title: 'Project A.I.',
            date: 'Sep 2022 - Dec 2022',
            url: 'https://github.com/SadraShameli/ProjectAI',
            summary: 'Autonomous self-driving robot based on camera vision and lidar.',
            highlights: [
                'Fully autonomous driving without any input from the user',
                'Ability to manually control using a PS4 or PS5 controller',
                'Making use of the well-proven machine learning library TensorFlow',
                'Using threads and thread pooling for every core functionality',
            ],
            skills: ['C++, Python, 3D Printing'],
        },
        {
            title: 'Partify',
            date: 'Jan 2023 - Present',
            url: 'https://github.com/SadraShameli/Partify',
            summary: 'Online e-commerce store',
            skills: ['TypeScript, React, Next.js, Tailwind CSS, tRPC, Prisma, NextAuth.js, PostgreSQL'],
        },
    ],
    educations: [{ title: 'Grotius College', date: 'Sep 2020, Aug 2023', url: 'https://www.grotiuscollege.nl', role: 'VWO - N&T', summary: '' }],
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
