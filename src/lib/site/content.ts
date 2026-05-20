import type { StaticImageData } from 'next/image';

import type { GalleryItem } from '~/app/(app)/_components/GallerySection';

import BSPImage from '~/assets/images/bsp.jpeg';
import DiplomaImage from '~/assets/images/diploma.jpg';
import PorscheImage from '~/assets/images/gallery/porsche.jpg';
import SetupImage from '~/assets/images/gallery/setup.jpg';
import SpainChurchImage from '~/assets/images/gallery/spain-church.jpg';
import SpainPoolImage from '~/assets/images/gallery/spain-pool.jpg';
import SadraImage from '~/assets/images/pictureBar.jpg';
import ProjectAIImage from '~/assets/images/projectai.jpg';
import SensorHubImage from '~/assets/images/units.jpg';

export type ResumeSectionView = {
    date: string;
    highlights?: string[];
    imageUrl?: string;
    location?: { title: string; url?: null | string };
    role?: null | string;
    skills?: string[];
    summary?: null | string;
    title: string;
    url?: null | string;
};

type HomepageData = {
    aboutSectionTitle: string;
    aboutSpotifyEmbedUrl: string;
    ctaLabel: string;
    gallery: GalleryItem[];
    heroImage: StaticImageData;
    heroSubtitle: string;
    heroTitle: string;
    readingsDescription: string;
    readingsTitle: string;
    recordingDecorVideo: string;
    recordingsDescription: string;
    recordingsTitle: string;
    sensorHubDescription: string;
    sensorHubTitle: string;
    sensorHubVideo: string;
};

type ResumeData = {
    education: ResumeSectionView[];
    educationSectionTitle: string;
    experience: ResumeSectionView[];
    experienceSectionTitle: string;
    metaDescription: string;
    metaTitle: string;
    projects: ResumeSectionView[];
    projectsSectionTitle: string;
};

type SiteData = {
    metaDescription: string;
    metaTitle: string;
    navBrand: string;
    resumeUrl: string;
    socialLinks: { platform: string; url: string }[];
};

export const siteContent: SiteData = {
    metaDescription: 'Daytrader, developer',
    metaTitle: 'Sadra Shameli',
    navBrand: '_sadra',
    resumeUrl: '/resume',
    socialLinks: [
        { platform: 'instagram', url: 'https://instagram.com/sadra22._' },
        { platform: 'youtube', url: 'https://youtube.com/@sadrashameli' },
    ] as { platform: string; url: string }[],
};

export const homepageContent: HomepageData = {
    aboutSectionTitle: 'More about me',
    aboutSpotifyEmbedUrl:
        'https://open.spotify.com/embed/track/4kjI1gwQZRKNDkw1nI475M?utm_source=generator&theme=0',
    ctaLabel: 'More about me',
    gallery: [
        { alt: 'Spain Pool', src: SpainPoolImage.src },
        { alt: 'Spain Church', src: SpainChurchImage.src },
        { alt: 'Porsche', src: PorscheImage.src },
        { alt: 'PC Setup', src: SetupImage.src },
    ] as GalleryItem[],
    heroImage: SadraImage,
    heroSubtitle: 'Daytrader, developer',
    heroTitle: 'Sadra Shameli',
    readingsDescription:
        'Ever been curious about the temperature, humidity and loudness levels at various locations in real time?',
    readingsTitle: 'Live readings',
    recordingDecorVideo: '/headphone.mp4',
    recordingsDescription:
        'Here you will find a list of noise recordings made by the Sensor Hub devices, which are placed at various locations in the Netherlands.',
    recordingsTitle: 'Noise recordings',
    sensorHubDescription:
        'Devices made by me, designed to record and register various climate telemetry and noise pollution data.',
    sensorHubTitle: 'This is Sensor Hub',
    sensorHubVideo: '/sensorUnit.mp4',
};

export const resumeContent: ResumeData = {
    education: [
        {
            date: 'Sep 2020 - Aug 2023',
            imageUrl: DiplomaImage.src,
            location: {
                title: 'Delft, The Netherlands',
            },
            role: 'VWO - Nature and Technology',
            title: 'Grotius College',
            url: 'https://www.grotiuscollege.nl',
        },
    ] as ResumeSectionView[],
    educationSectionTitle: 'Education',
    experience: [
        {
            date: 'Dec 2021 - Jun 2023 · 1 yr 6 mo',
            highlights: [
                'Enhanced application performance with efficient lazy loading and advanced routing techniques',
                'Designed and implemented reusable react components',
                'Directed research to elevate performance, centering on user experience',
                'Designed various IoT devices from ground up, including 3D modeling and printing',
                'Cooperated a CI/CD pipeline using Azure DevOps',
            ],
            imageUrl: BSPImage.src,
            location: {
                title: 'Rotterdam, The Netherlands',
                url: 'https://goo.gl/maps/v9asMxGqgKwcvwQw5',
            },
            role: 'Full-stack developer',
            skills: [
                'React',
                'TypeScript',
                'Next.js',
                'ASP.NET',
                'SQL Server',
                'Unit Testing',
            ],
            summary:
                'As a full-stack developer at <strong>Blue Star Planning</strong>, I was responsible for creating a full-stack application integrating <strong>IoT devices</strong> for telemetry collection, a robust <strong>backend</strong> for data storage, analysis, and processing, and an intuitive <strong>frontend</strong> for data visualization.',
            title: 'Blue Star Planning',
            url: 'https://bluestarplanning.com',
        },
        {
            date: 'May 2021 - Dec 2022 · 1 yr 8 mo',
            location: {
                title: 'Den Haag, The Netherlands',
                url: 'https://maps.app.goo.gl/xWFe1zER9cE8RKBg9',
            },
            role: 'Salesman',
            title: 'Gamma',
            url: 'https://gamma.nl',
        },
        {
            date: 'Sep 2021 - Mar 2022 · 7 mo',
            location: {
                title: 'Rijswijk, The Netherlands',
                url: 'https://maps.app.goo.gl/AUQwbGpcZDWswzLHA',
            },
            role: 'Salesman',
            title: 'Hoogvliet',
            url: 'https://hoogvliet.com',
        },
        {
            date: 'Jul 2020 - Dec 2020 · 6 mo',
            location: {
                title: 'Rijswijk, The Netherlands',
                url: 'https://maps.app.goo.gl/EDxYvZddBXw17z7V8',
            },
            role: 'Delivery Driver',
            title: "Domino's Pizza",
            url: 'https://dominos.nl',
        },
    ] as ResumeSectionView[],
    experienceSectionTitle: 'Work experience',
    metaDescription: 'Daytrader, developer',
    metaTitle: 'Sadra Shameli',
    projects: [
        {
            date: 'Sep 2022 - Dec 2022',
            highlights: [
                'Fully autonomous driving without any input from the user',
                'Ability to manually control using a PS5 or PS4 controller',
                'Utilizing the TensorFlow machine learning library',
                'Using multithreading for every core functionality',
            ],
            imageUrl: ProjectAIImage.src,
            location: {
                title: 'Delft, The Netherlands',
            },
            role: 'Self Driving Robot',
            skills: ['3D Printing', 'Machine Learning', 'Python', 'C++'],
            summary:
                'The purpose of this project is to create an <strong>autonomous self-driving robot</strong>, which is able to <strong>follow a course and avoid obstacles</strong>, all on its own.',
            title: 'Project A.I.',
            url: 'https://github.com/SadraShameli/ProjectAI',
        },
        {
            date: 'Feb 2024 - Present',
            highlights: [
                'Focus on optimizations: Debug and release configurations apply different macros and compiler flags',
                'Supporting multithreading for all core functionality',
                'Advanced failsafe system and logging mechanisms',
                'Saving a list of last 25 failures that occurred during the runtime',
                'Using XOR bitwise operations with the mac address to encrypt user data',
                'Custom Pin, WiFi, HTTP and Gui classes',
                'Handling runtime and backend errors',
            ],
            imageUrl: SensorHubImage.src,
            location: {
                title: 'Rotterdam, The Netherlands',
            },
            role: 'Gathering telemetries',
            skills: ['3D Printing', 'C++', 'ESP32', 'IoT devices'],
            summary:
                'This project is part of a full-stack application and is intended to gather various data such as <strong>temperature, humidity, air pressure, gas resistance, altitude, loudness levels, noise recordings and RPM values</strong>. The devices are placed at various locations in the Netherlands.',
            title: 'Sensor Hub',
            url: 'https://github.com/SadraShameli/SensorHub',
        },
        {
            date: 'Mar 2024 - Present',
            highlights: [
                'Type-safe front-end and back-end using Typescript, React, Next.js, tRPC',
                'Using React Query for efficient state management',
                'Implemented CRUD functionalities using Next.js App Router',
                'Using drizzle for near-instant SQL queries and mutations',
                'Enhanced application performance with efficient lazy loading',
                'Designed and implemented reusable react components',
                'Cooperated a CI/CD pipeline using GitHub Actions',
            ],
            location: {
                title: 'Rijswijk, The Netherlands',
            },
            role: 'Personal site',
            skills: [
                'Typescript',
                'React',
                'Next.js',
                'tRPC',
                'React Query',
                'Tailwind CSS',
            ],
            summary:
                'This project is part of a <strong>full-stack application</strong> with multiple objectives, serving as both a <strong>personal portfolio</strong> and a <strong>backend</strong> for <strong>Sensor Hub</strong> devices. The application makes the devices able to fetch configuration, register telemetries and save noise recordings.',
            title: 'sadra.nl',
            url: 'https://github.com/SadraShameli/sadra.nl',
        },
    ] as ResumeSectionView[],
    projectsSectionTitle: 'Recent projects',
};
