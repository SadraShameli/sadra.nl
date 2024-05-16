export interface IProfile {
    title: string;
    url: string;
    icon: JSX.Element;
}

export interface ILocation {
    title: string;
    url: string;
}

export interface IResumeBasics {
    firstName: string;
    lastName: string;
    title: string;
    email: string;
    phone: string;
    summary: string;
    location: ILocation;
    profiles: IProfile[];
}

export interface IResumeKeyPoint {
    title: string;
    summary?: string;
    keywords: string[];
}

export interface IResumeSection {
    title: string;
    date: string;
    url: string;
    summary: string;
    role: string;
    location?: ILocation;
    highlights?: string[];
    skills?: string[];
}

export interface IResumeLanguage {
    language: string;
    fluency: 'Native speaker' | 'Full Professional Proficiency';
}

export interface IResume {
    title: string;
    description: string;
    basics: IResumeBasics;
    keypoints: IResumeKeyPoint[];
    works: IResumeSection[];
    projects: IResumeSection[];
    educations: IResumeSection[];
    languages: IResumeLanguage[];
}
