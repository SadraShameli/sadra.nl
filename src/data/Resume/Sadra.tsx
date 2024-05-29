import GithubIcon from '~/components/ui/Icons/Github';
import InstagramIcon from '~/components/ui/Icons/Instagram';
import WhatsAppIcon from '~/components/ui/Icons/WhatsApp';
import YoutubeIcon from '~/components/ui/Icons/Youtube';

import { CalculateAge, type IResume } from './types';

const birthday = new Date('2003-12-11');
const age = CalculateAge(birthday);

const ResumeSadra: IResume = {
  title: 'Sadra',
  description: 'Futures & crypto trader, developer',
  basics: {
    title: 'Sadra Shameli',
    firstName: 'Sadra',
    lastName: 'Shameli',
    email: 'sadra.shameli1@gmail.com',
    phone: '+31 06 85156033',
    birth: '11/12/2003',
    summary: `Full-stack & embedded developer, based in Rijswijk, the Netherlands. My tech stack consists of TypeScript, React and Next together with tRPC, Drizzle and NextAuth. I am also experienced in building IoT devices and robots.`,
    summary2: `I am Sadra Shameli, ${age} years old, living in Rijswijk, The Netherlands. I trade index futures and crypto. Besides that, I build cool things and love photography.`,
    location: {
      title: 'Rijswijk, The Netherlands',
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
    'TypeScript ••• React ••• Next',
    'Tailwind CSS ••• Material UI',
    'tRPC ••• Drizzle & Prisma ••• NextAuth',
    'PostgreSQL ••• SQL Server',
    '3D Modeling & Printing',
    'ASP.NET ••• Entity Framework',
  ],
  education: [
    {
      title: 'Grotius College',
      date: 'Sep 2020 - Aug 2023',
      location: {
        title: 'Delft, The Netherlands',
        url: 'https://maps.app.goo.gl/qNGqcpBCuBW8RM6x9',
      },
      url: 'https://www.grotiuscollege.nl',
      role: 'VWO - N&T',
    },
  ],
  research: [],
  experience: [
    {
      title: 'Blue Star Planning',
      date: 'Dec 2021 - Jan 2023',
      location: {
        title: 'Rotterdam, The Netherlands',
        url: 'https://goo.gl/maps/v9asMxGqgKwcvwQw5',
      },
      url: 'https://bluestarplanning.com',
      summary:
        'Blue Star Planning is specialized in the development and realization of Advanced Planning and Scheduling systems.',
      role: 'Full-stack & embedded',
      highlights: [
        'Developed various IoT devices including 3D printing. Intended to gather various data, such as sound recordings, loudness, temperature and humidity, air quality and RPM values. The devices are placed at different locations in The Netherlands.',
        'Developed the back-end to process the data gathered by the devices as well as the front-end, where the sound recordings and loudness values are available.',
      ],
      skills: [
        'React ••• TypeScript ••• Material UI ••• ASP.NET ••• SQL Server',
      ],
    },
  ],
  projects: [
    {
      title: 'Project A.I.',
      date: 'Sep 2022 - Dec 2022',
      url: 'https://github.com/SadraShameli/ProjectAI',
      summary:
        'Autonomous self-driving robot based on camera vision and lidar.',
      role: 'Self driving robot',
      highlights: [
        'Fully autonomous driving without any input from the user',
        'Ability to manually control using a PS5 or PS4 controller',
        'Utilizing the TensorFlow machine learning library',
        'Using multithreading for every core functionality',
      ],
      skills: ['3D Printing ••• Machine Learning'],
    },
  ],
  languages: [
    {
      title: 'English',
      fluency: 'Full Professional Proficiency',
    },
    {
      title: 'Dutch',
      fluency: 'Full Professional Proficiency',
    },
    {
      title: 'Persian',
      fluency: 'Native speaker',
    },
  ],
  hobbies: ['Programming', 'Robotics', 'Photography', 'Guitar', 'Cars'],
};

export default ResumeSadra;
