import Link from 'next/link';
import HomeIcon from '~/components/Icons/Home';
import StackIcon from '~/components/Icons/Stack';
import WorkBagIcon from '~/components/Icons/WorkBag';
import ProfileIcon from '~/components/Icons/Profile';
import EducationIcon from '~/components/Icons/Education';

export default function Sidebar() {
    return (
        <nav className='fixed -top-[-35%] left-[3%]'>
            <div className='rounded-lg absolute -inset-0.5 bg-gradient-to-br from-indigo-200 to-indigo-900 opacity-50 blur'></div>
            <span className='rounded-xl relative grid divide-x bg-black px-6 py-3'>
                <div className='my-3 grid space-y-6'>
                    <NavButton title='Home' url='/' icon={<HomeIcon />} />
                    <NavButton title='About' url='about' icon={<ProfileIcon />} />
                    <NavButton title='Work' url='profile' icon={<WorkBagIcon />} />
                    <NavButton title='Projects' url='profile#projects' icon={<StackIcon />} />
                    <NavButton title='Education' url='profile#education' icon={<EducationIcon />} />
                </div>
            </span>
        </nav>
    );
}

function NavButton({ title, url, icon }: { title: string; url: string; icon: JSX.Element }) {
    return (
        <Link href={url}>
            <button className='rounded-lg flex h-12 items-center border border-indigo-950 border-opacity-75 bg-gradient-to-br from-indigo-950 from-[-50%] to-black px-4 font-medium text-white'>
                <div className='h-5 w-5'>{icon}</div>
                <h2 className='font-orbitron ml-5 border-l border-white border-opacity-15 pl-5 leading-none tracking-widest'>{title}</h2>
            </button>
        </Link>
    );
}
