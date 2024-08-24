import { type StaticImageData } from 'next/image';

export interface ILink {
    title: string;
    url: string;
}

export interface IProfile extends ILink {
    icon: React.ReactNode;
}

export interface IResumeBasics {
    title: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    birth: string;
    summary: string;
    summary2?: string;
    location: ILink;
}

export interface IResumeSection {
    title: string;
    date: string;
    location?: ILink;
    url?: string;
    summary?: string;
    role?: string;
    highlights?: string[];
    skills?: string[];
    image?: StaticImageData;
}

export interface IResumeLanguage {
    title: string;
    fluency: 'Native speaker' | 'Professional Proficiency';
}

export interface IResume {
    title: string;
    description: string;
    basics: IResumeBasics;
    profiles: IProfile[];
    links: ILink[];
    skills: string[];
    education: IResumeSection[];
    research: IResumeSection[];
    experience: IResumeSection[];
    projects: IResumeSection[];
    languages: IResumeLanguage[];
    hobbies: string[];
}
