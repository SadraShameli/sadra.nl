import { BRAND_ICON, brandIconImage } from '~/lib/site/brandImage';

export {
    BRAND_IMAGE_CONTENT_TYPE as contentType,
    BRAND_ICON_SIZE as size,
} from '~/lib/site/brandImage';

export default function Icon() {
    return brandIconImage(BRAND_ICON);
}
