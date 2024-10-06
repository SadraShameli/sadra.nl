import { type IResume } from './types';

import GithubIcon from '~/components/ui/Icons/Github';
import InstagramIcon from '~/components/ui/Icons/Instagram';
import WhatsAppIcon from '~/components/ui/Icons/WhatsApp';
import YoutubeIcon from '~/components/ui/Icons/Youtube';

import BSP from '~/assets/images/bsp.jpeg';
import Diploma from '~/assets/images/diploma.jpg';
import ProjectAI from '~/assets/images/projectai.jpg';
import SensorUnit from '~/assets/images/units.jpg';

const resumeSadra: IResume = {
    title: 'Sadra',
    description: 'Futures & crypto trader, developer',
    basics: {
        title: 'Sadra Shameli',
        firstName: 'Sadra',
        lastName: 'Shameli',
        email: 'sadra.shameli1@gmail.com',
        phone: '+31 06 85156033',
        birth: 'Dec 2003',
        summary: `Full-stack developer with 2 years of experience. Proficient in TypeScript, React and Next.js with tRPC, React Query, Prisma, Drizzle and NextAuth for building type-safe backends. Skilled in Tailwind CSS and Framer Motion for designing modern UI/UX. I am also experienced in designing IoT devices.`,
        location: {
            title: 'Rijswijk - The Netherlands',
            url: '',
        },
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
    ],
    links: [
        { title: 'sadra.nl', url: 'https://sadra.nl' },
        { title: 'Github', url: 'https://github.com/sadrashameli' },
        { title: 'Youtube', url: 'https://youtube.com/@sadrashameli' },
        { title: 'Linkedin', url: 'https://linkedin.com/in/sadrashameli' },
    ],
    skills: [
        'TypeScript •• React •• Next.js',
        'Tailwind CSS •• Framer Motion',
        'tRPC •• React Query •• Drizzle, Prisma',
        'PostgreSQL •• SQL Server',
        '3D Modeling & Printing',
        'ASP.NET •• Entity Framework',
    ],
    education: [
        {
            title: 'Grotius College',
            role: 'VWO - Natuur en Techniek',
            date: 'Sep 2020 - Aug 2023',
            location: { title: 'Delft, The Netherlands', url: '' },
            url: 'https://www.grotiuscollege.nl',
            image: Diploma,
        },
    ],
    research: [],
    experience: [
        {
            title: 'Blue Star Planning',
            role: 'Full-stack developer · Parttime',
            date: 'Dec 2021 - Jan 2023 · 1 yr 1 mo',
            location: {
                title: 'Rotterdam, The Netherlands',
                url: 'https://goo.gl/maps/v9asMxGqgKwcvwQw5',
            },
            url: 'https://bluestarplanning.com',
            summary:
                'As a full-stack developer at <strong>Blue Star Planning</strong>, I was responsible for creating a full-stack application integrating <strong>IoT devices</strong> for telemetry collection, a robust <strong>backend</strong> for data storage, analysis, and processing, and an intuitive <strong>frontend</strong> for data visualization. Key responsibilities:',
            highlights: [
                'Enhanced application performance with efficient lazy loading and advanced routing techniques to eliminate unused code',
                'Designed and implemented reusable react components, contributing to code modularity and maintainability',
                'Directed research to elevate performance, centering on user experience and streamlined system efficiency',
                'Designed various IoT devices from ground up, including 3D modeling and printing. Intended to gather various telemetries, such as temperature, humidity, air pressure, gas resistance, altitude, loudness levels, noise recordings and RPM values. The devices are placed at various locations in the Netherlands and are continuously registering data',
                'Cooperated a CI/CD pipeline using Azure DevOps for streamlined and automated deployments, resulting in faster and more reliable code base',
            ],
            skills: ['React ••• TypeScript ••• Next.js ••• ASP.NET ••• SQL Server ••• Unit Testing'],
            image: BSP,
        },
        {
            title: 'Gamma',
            role: 'Salesman · Parttime',
            date: 'May 2021 - Dec 2022 · 1 yr 8 mo',
            location: {
                title: 'Den Haag, The Netherlands',
                url: 'https://maps.app.goo.gl/xWFe1zER9cE8RKBg9',
            },
            url: 'https://gamma.nl',
        },
        {
            title: 'Hoogvliet',
            role: 'Salesman · Parttime',
            date: 'Sep 2021 - Mar 2022 · 7 mo',
            location: {
                title: 'Rijswijk, The Netherlands',
                url: 'https://maps.app.goo.gl/AUQwbGpcZDWswzLHA',
            },
            url: 'https://hoogvliet.com',
        },
        {
            title: "Domino's",
            role: 'Delivery Driver · Parttime',
            date: 'Jul 2020 - Dec 2020 · 6 mo',
            location: {
                title: 'Rijswijk, The Netherlands',
                url: 'https://maps.app.goo.gl/EDxYvZddBXw17z7V8',
            },
            url: 'https://dominos.nl',
        },
    ],
    projects: [
        {
            title: 'sadra.nl',
            role: 'Personal portfolio',
            date: 'Mar 2024 - Present',
            url: 'https://github.com/SadraShameli/sadra.nl',
            summary: `This project is part of a <strong>full-stack application</strong> with multiple objectives, serving as both a <strong>personal portfolio</strong> and a <strong>backend</strong> for <strong>Sensor Hub</strong> devices. The application makes the devices able to fetch configuration, register telemetries and save noise recordings. Additionally, it includes a <strong>frontend</strong> for visualizing the data collected by the Sensor Hub devices.`,
            highlights: [
                'Type-safe front-end and back-end using Typescript, React, Next.js, tRPC',
                'Using React Query for for efficient state management, handling loading and error states, and managing stale data seamlessly',
                'Implemented CRUD functionalities using Next.js App Router to manage the database and user interactions effectively',
                "Using drizzle for near-instant SQL queries and mutations, enhancing the application's responsiveness.",
                'Enhanced application performance with efficient lazy loading and advanced routing techniques to eliminate unused code',
                'Designed and implemented reusable react components, contributing to code modularity and maintainability',
                'Cooperated a CI/CD pipeline using GitHub Actions for streamlined and automated deployments, resulting in faster and more reliable code base',
            ],
            skills: ['Typescript ••• React ••• Next.js ••• tRPC ••• React Query ••• Tailwind CSS'],
        },
        {
            title: 'Sensor Hub',
            role: 'Gathering telemetries',
            date: 'Feb 2024 - Present',
            url: 'https://github.com/SadraShameli/SensorHub',
            summary:
                'This project is part of a full-stack application and is intended to gather various data such as <strong>temperature, humidity, air pressure, gas resistance, altitude, loudness levels, noise recordings and RPM values</strong>. The devices are placed at various locations in the Netherlands and are continuously sending these data to my website at my website <strong>sadra.nl</strong>.',
            highlights: [
                'Focus on optimizations: Debug and release configurations apply different macros and compiler flags to make debugging easy and runtime faster. Enabling all compiler warnings to write safer code. Using std::move and pass by reference to avoid additional copies',
                'Supporting multithreading for all core functionality. Tasks are created, suspended and deleted when needed: This results to a boot time of only 100ms when running in release mode',
                'Advanced failsafe system and logging mechanisms to notify users of potential errors and bugs',
                'Saving a list of last 25 failures that occurred during the runtime',
                'Using XOR bitwise operations with the mac address to encrypt user data before saving to the storage',
                'Custom Pin, WiFi, HTTP and Gui classes to provide simple APIs for ease of use',
                'Handling runtime and backend errors and notifying users with a failsafe when errors occur',
            ],
            skills: ['3D Printing ••• C++ ••• ESP32 ••• IoT devices'],
            image: SensorUnit,
        },
        {
            title: 'Project A.I.',
            date: 'Sep 2022 - Dec 2022',
            url: 'https://github.com/SadraShameli/ProjectAI',
            summary:
                'The purpose of this project is to create an <strong>autonomous self-driving robot</strong>, which is able to <strong>follow a course and avoid obstacles</strong>, all on its own. Its inspiration originates from being a big fan of Elon Musk, Tesla and its technology. This project is mainly created for <strong>PWS (profielwerkstuk)</strong> using our own specific hardware, but it can be replicated by the user to work on their hardware as well.',
            role: 'Self Driving Robot',
            highlights: [
                'Fully autonomous driving without any input from the user',
                'Ability to manually control using a PS5 or PS4 controller',
                'Utilizing the TensorFlow machine learning library',
                'Using multithreading for every core functionality',
            ],
            skills: ['3D Printing ••• Machine Learning ••• Python ••• C++'],
            image: ProjectAI,
        },
    ],
    languages: [
        {
            title: 'English',
            fluency: 'Professional Proficiency',
        },
        {
            title: 'Dutch',
            fluency: 'Professional Proficiency',
        },
        {
            title: 'Persian',
            fluency: 'Native speaker',
        },
    ],
    hobbies: ['Robotics', 'Photography', 'Guitar', 'Cars'],
};

export default resumeSadra;
