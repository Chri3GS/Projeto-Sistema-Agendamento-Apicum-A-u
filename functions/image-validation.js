const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = {
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp'
};

function supportedImage(bytes, contentType) {
    if (contentType === IMAGE_TYPES.jpg &&
        bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return 'jpg';
    }
    if (contentType === IMAGE_TYPES.png &&
        bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        return 'png';
    }
    if (contentType === IMAGE_TYPES.webp &&
        bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' &&
        bytes.toString('ascii', 8, 12) === 'WEBP') {
        return 'webp';
    }
    return null;
}

function isValidImageKey(key) {
    return typeof key === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i.test(key);
}

module.exports = {
    IMAGE_TYPES,
    MAX_IMAGE_BYTES,
    isValidImageKey,
    supportedImage
};
