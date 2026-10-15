import { brandCardImage } from '~/lib/site/brandImage';

export {
    BRAND_CARD_ALT as alt,
    BRAND_IMAGE_CONTENT_TYPE as contentType,
    BRAND_CARD_SIZE as size,
} from '~/lib/site/brandImage';

export default function OpenGraphImage() {
    return brandCardImage();
}
