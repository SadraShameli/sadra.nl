import GridBackground from '~/components/ui/GridBg';

import Navbar from '../_components/Navbar';
import ResumeSection from '../_components/Resume/Resume';

export default function ResumePage() {
    return (
        <>
            <Navbar />
            <GridBackground />

            <main className="grid w-full px-6 xl:px-0">
                <div className="mx-auto my-content max-w-content">
                    <ResumeSection />
                </div>
            </main>
        </>
    );
}
