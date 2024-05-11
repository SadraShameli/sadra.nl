import MoveAroundAnimation from './Animations/MoveAround';

export default function BackgroundSnipper() {
    return (
        <div className='fixed -top-0 -z-50'>
            <MoveAroundAnimation className='absolute -right-24 bottom-[30%] h-[1000px] w-[1000px] rounded-full bg-[radial-gradient(circle_400px_at_50%_300px,#fbfbfb36,#000)]' />
            <MoveAroundAnimation className='absolute -left-24 top-[60%] h-[1000px] w-[1000px] rounded-full bg-[radial-gradient(circle_400px_at_50%_300px,#fbfbfb36,#000)]' />
            <div className='bg-grid h-screen w-screen' />
        </div>
    );
}