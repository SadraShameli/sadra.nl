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
    title: string;
    role?: string | null;
    date: string;
    url?: string | null;
    location?: { title: string; url?: string | null };
    summary?: string | null;
    highlights?: string[];
    skills?: string[];
    imageUrl?: string;
};

type SiteData = {
    metaTitle: string;
    metaDescription: string;
    navBrand: string;
    socialLinks: { platform: string; url: string }[];
    resumeUrl: string;
};

type HomepageData = {
    heroImage: StaticImageData;
    heroTitle: string;
    heroSubtitle: string;
    ctaLabel: string;
    sensorHubTitle: string;
    sensorHubDescription: string;
    sensorHubVideo: string;
    recordingsTitle: string;
    recordingsDescription: string;
    recordingDecorVideo: string;
    readingsTitle: string;
    readingsDescription: string;
    aboutSectionTitle: string;
    aboutSpotifyEmbedUrl: string;
    gallery: GalleryItem[];
};

type ResumeData = {
    metaTitle: string;
    metaDescription: string;
    projectsSectionTitle: string;
    experienceSectionTitle: string;
    educationSectionTitle: string;
    projects: ResumeSectionView[];
    experience: ResumeSectionView[];
    education: ResumeSectionView[];
};

export const siteContent: SiteData = {
    metaTitle: 'Sadra Shameli',
    metaDescription: 'Daytrader, developer',
    navBrand: '_sadra',
    socialLinks: [
        { platform: 'instagram', url: 'https://instagram.com/sadra22._' },
        { platform: 'youtube', url: 'https://youtube.com/@sadrashameli' },
    ] as { platform: string; url: string }[],
    resumeUrl: '/resume',
};

export const homepageContent: HomepageData = {
    heroImage: SadraImage,
    heroTitle: 'Sadra Shameli',
    heroSubtitle: 'Daytrader, developer',
    ctaLabel: 'More about me',
    sensorHubTitle: 'This is Sensor Hub',
    sensorHubDescription:
        'Devices made by me, designed to record and register various climate telemetry and noise pollution data.',
    sensorHubVideo: '/sensorUnit.mp4',
    recordingsTitle: 'Noise recordings',
    recordingsDescription:
        'Here you will find a list of noise recordings made by the Sensor Hub devices, which are placed at various locations in the Netherlands.',
    recordingDecorVideo: '/headphone.mp4',
    readingsTitle: 'Live readings',
    readingsDescription:
        'Ever been curious about the temperature, humidity and loudness levels at various locations in real time?',
    aboutSectionTitle: 'More about me',
    aboutSpotifyEmbedUrl:
        'https://open.spotify.com/embed/track/4kjI1gwQZRKNDkw1nI475M?utm_source=generator&theme=0',
    gallery: [
        { src: SpainPoolImage.src, alt: 'Spain Pool' },
        { src: SpainChurchImage.src, alt: 'Spain Church' },
        { src: PorscheImage.src, alt: 'Porsche' },
        { src: SetupImage.src, alt: 'PC Setup' },
    ] as GalleryItem[],
};

export const resumeContent: ResumeData = {
    metaTitle: 'Sadra Shameli',
    metaDescription: 'Daytrader, developer',
    projectsSectionTitle: 'Recent projects',
    experienceSectionTitle: 'Work experience',
    educationSectionTitle: 'Education',
    projects: [
        {
            title: 'Project A.I.',
            role: 'Self Driving Robot',
            date: 'Sep 2022 - Dec 2022',
            url: 'https://github.com/SadraShameli/ProjectAI',
            location: {
                title: 'Delft, The Netherlands',
            },
            summary:
                'The purpose of this project is to create an <strong>autonomous self-driving robot</strong>, which is able to <strong>follow a course and avoid obstacles</strong>, all on its own.',
            highlights: [
                'Fully autonomous driving without any input from the user',
                'Ability to manually control using a PS5 or PS4 controller',
                'Utilizing the TensorFlow machine learning library',
                'Using multithreading for every core functionality',
            ],
            skills: ['3D Printing', 'Machine Learning', 'Python', 'C++'],
            imageUrl: ProjectAIImage.src,
        },
        {
            title: 'Sensor Hub',
            role: 'Gathering telemetries',
            date: 'Feb 2024 - Present',
            url: 'https://github.com/SadraShameli/SensorHub',
            location: {
                title: 'Rotterdam, The Netherlands',
            },
            summary:
                'This project is part of a full-stack application and is intended to gather various data such as <strong>temperature, humidity, air pressure, gas resistance, altitude, loudness levels, noise recordings and RPM values</strong>. The devices are placed at various locations in the Netherlands.',
            highlights: [
                'Focus on optimizations: Debug and release configurations apply different macros and compiler flags',
                'Supporting multithreading for all core functionality',
                'Advanced failsafe system and logging mechanisms',
                'Saving a list of last 25 failures that occurred during the runtime',
                'Using XOR bitwise operations with the mac address to encrypt user data',
                'Custom Pin, WiFi, HTTP and Gui classes',
                'Handling runtime and backend errors',
            ],
            skills: ['3D Printing', 'C++', 'ESP32', 'IoT devices'],
            imageUrl: SensorHubImage.src,
        },
        {
            title: 'sadra.nl',
            role: 'Personal site',
            date: 'Mar 2024 - Present',
            url: 'https://github.com/SadraShameli/sadra.nl',
            location: {
                title: 'Rijswijk, The Netherlands',
            },
            summary:
                'This project is part of a <strong>full-stack application</strong> with multiple objectives, serving as both a <strong>personal portfolio</strong> and a <strong>backend</strong> for <strong>Sensor Hub</strong> devices. The application makes the devices able to fetch configuration, register telemetries and save noise recordings.',
            highlights: [
                'Type-safe front-end and back-end using Typescript, React, Next.js, tRPC',
                'Using React Query for efficient state management',
                'Implemented CRUD functionalities using Next.js App Router',
                'Using drizzle for near-instant SQL queries and mutations',
                'Enhanced application performance with efficient lazy loading',
                'Designed and implemented reusable react components',
                'Cooperated a CI/CD pipeline using GitHub Actions',
            ],
            skills: [
                'Typescript',
                'React',
                'Next.js',
                'tRPC',
                'React Query',
                'Tailwind CSS',
            ],
        },
    ] as ResumeSectionView[],
    experience: [
        {
            title: 'Blue Star Planning',
            role: 'Full-stack developer',
            date: 'Dec 2021 - Jun 2023 · 1 yr 6 mo',
            url: 'https://bluestarplanning.com',
            location: {
                title: 'Rotterdam, The Netherlands',
                url: 'https://goo.gl/maps/v9asMxGqgKwcvwQw5',
            },
            summary:
                'As a full-stack developer at <strong>Blue Star Planning</strong>, I was responsible for creating a full-stack application integrating <strong>IoT devices</strong> for telemetry collection, a robust <strong>backend</strong> for data storage, analysis, and processing, and an intuitive <strong>frontend</strong> for data visualization.',
            highlights: [
                'Enhanced application performance with efficient lazy loading and advanced routing techniques',
                'Designed and implemented reusable react components',
                'Directed research to elevate performance, centering on user experience',
                'Designed various IoT devices from ground up, including 3D modeling and printing',
                'Cooperated a CI/CD pipeline using Azure DevOps',
            ],
            skills: [
                'React',
                'TypeScript',
                'Next.js',
                'ASP.NET',
                'SQL Server',
                'Unit Testing',
            ],
            imageUrl: BSPImage.src,
        },
        {
            title: 'Gamma',
            role: 'Salesman',
            date: 'May 2021 - Dec 2022 · 1 yr 8 mo',
            url: 'https://gamma.nl',
            location: {
                title: 'Den Haag, The Netherlands',
                url: 'https://maps.app.goo.gl/xWFe1zER9cE8RKBg9',
            },
        },
        {
            title: 'Hoogvliet',
            role: 'Salesman',
            date: 'Sep 2021 - Mar 2022 · 7 mo',
            url: 'https://hoogvliet.com',
            location: {
                title: 'Rijswijk, The Netherlands',
                url: 'https://maps.app.goo.gl/AUQwbGpcZDWswzLHA',
            },
        },
        {
            title: "Domino's Pizza",
            role: 'Delivery Driver',
            date: 'Jul 2020 - Dec 2020 · 6 mo',
            url: 'https://dominos.nl',
            location: {
                title: 'Rijswijk, The Netherlands',
                url: 'https://maps.app.goo.gl/EDxYvZddBXw17z7V8',
            },
        },
    ] as ResumeSectionView[],
    education: [
        {
            title: 'Grotius College',
            role: 'VWO - Nature and Technology',
            date: 'Sep 2020 - Aug 2023',
            url: 'https://www.grotiuscollege.nl',
            location: {
                title: 'Delft, The Netherlands',
            },
            imageUrl: DiplomaImage.src,
        },
    ] as ResumeSectionView[],
};
