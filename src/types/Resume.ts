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
    title: string;
    role: string;
    email: string;
    phone: string;
    summary: string;
    location: ILocation;
    profiles: IProfile[];
}

export interface IResumeSkill {
    title: string;
    keywords: string[];
}

export interface IResumeSection {
    title: string;
    date: string;
    url: string;
    role?: string;
    location?: ILocation;
    summary: string;
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
    skills: IResumeSkill[];
    works: IResumeSection[];
    projects: IResumeSection[];
    educations: IResumeSection[];
    languages: IResumeLanguage[];
}
