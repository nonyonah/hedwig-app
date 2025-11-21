import 'react-native-get-random-values';
import { Buffer } from 'buffer';

export const getRandomValues = (buffer) => {
    return global.crypto.getRandomValues(buffer);
};

export const randomBytes = (length, cb) => {
    const buffer = Buffer.alloc(length);
    getRandomValues(buffer);
    if (cb) {
        cb(null, buffer);
    }
    return buffer;
};

export const createHash = () => {
    throw new Error('createHash not implemented in shim');
};

export default {
    getRandomValues,
    randomBytes,
    createHash,
};
