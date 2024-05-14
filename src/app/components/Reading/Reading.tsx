import { api } from '~/trpc/server';

export default function ReadingSection() {
    api.deviceProperties;
    return (
        <div>
            <h2 className='xl:text-7x pb-16 text-center text-4xl font-semibold text-white md:text-6xl'>
                These are the loudness levels registered by my devices
            </h2>
        </div>
    );
}
