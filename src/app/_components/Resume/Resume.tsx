import diplomaImg from '~/assets/images/diploma.jpg';
import projectAiImg from '~/assets/images/projectai.jpg';
import workImg from '~/assets/images/units.jpg';
import ResumeSadra from '~/data/Resume/Sadra';

import ResumeItem from './ResumeItem';

export default function ResumeSection() {
  return (
    <div className="grid gap-y-10">
      <ResumeItem
        title="Projects"
        img={projectAiImg}
        sections={ResumeSadra.projects}
      />

      <ResumeItem
        title="Experience"
        img={workImg}
        sections={ResumeSadra.experience}
      />

      <ResumeItem
        title="Education"
        img={diplomaImg}
        sections={ResumeSadra.education}
      />
    </div>
  );
}
