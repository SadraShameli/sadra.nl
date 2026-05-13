import { type StaticImageData } from 'next/image';

export interface ILink {
    title: string;
    url: string;
}

export interface IProfile extends ILink {
    icon: React.ReactNode;
}

export interface IResume {
    basics: IResumeBasics;
    description: string;
    education: IResumeSection[];
    experience: IResumeSection[];
    hobbies: string[];
    languages: IResumeLanguage[];
    links: ILink[];
    profiles: IProfile[];
    projects: IResumeSection[];
    research: IResumeSection[];
    skills: string[];
    title: string;
}

export interface IResumeBasics {
    birth: string;
    email: string;
    firstName: string;
    lastName: string;
    location: ILink;
    phone: string;
    summary: string;
    summary2?: string;
    title: string;
}

export interface IResumeLanguage {
    fluency: 'Native speaker' | 'Professional Proficiency';
    title: string;
}

export interface IResumeSection {
    date: string;
    highlights?: string[];
    image?: StaticImageData;
    location?: ILink;
    role?: string;
    skills?: string[];
    summary?: string;
    title: string;
    url?: string;
}
