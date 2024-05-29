export function CalculateAge(dob: Date) {
  const diff_ms = Date.now() - dob.getTime();
  const age_dt = new Date(diff_ms);

  return Math.abs(age_dt.getUTCFullYear() - 1970);
}

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
}

export interface IResumeLanguage {
  title: string;
  fluency: 'Native speaker' | 'Full Professional Proficiency';
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
