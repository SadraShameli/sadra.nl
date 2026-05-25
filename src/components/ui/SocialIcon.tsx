import GithubIcon from '~/components/ui/Icons/Github';
import InstagramIcon from '~/components/ui/Icons/Instagram';
import LinkedinIcon from '~/components/ui/Icons/Linkedin';
import WhatsAppIcon from '~/components/ui/Icons/WhatsApp';
import YoutubeIcon from '~/components/ui/Icons/Youtube';

export function SocialIcon({ platform }: { platform: string }) {
    switch (platform) {
        case 'github': {
            return <GithubIcon />;
        }
        case 'instagram': {
            return <InstagramIcon />;
        }
        case 'linkedin': {
            return <LinkedinIcon />;
        }
        case 'whatsapp': {
            return <WhatsAppIcon />;
        }
        case 'youtube': {
            return <YoutubeIcon />;
        }
        default: {
            return null;
        }
    }
}
