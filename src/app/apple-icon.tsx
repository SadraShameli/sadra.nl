import { BRAND_APPLE_ICON, brandIconImage } from '~/lib/site/brandImage';

export {
    BRAND_IMAGE_CONTENT_TYPE as contentType,
    BRAND_APPLE_ICON_SIZE as size,
} from '~/lib/site/brandImage';

export default function AppleIcon() {
    return brandIconImage(BRAND_APPLE_ICON);
}
