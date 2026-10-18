import GithubIcon from '~/components/ui/icons/github';
import InstagramIcon from '~/components/ui/icons/instagram';
import LinkedinIcon from '~/components/ui/icons/linkedin';
import WhatsAppIcon from '~/components/ui/icons/whatsapp';
import YoutubeIcon from '~/components/ui/icons/youtube';

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
