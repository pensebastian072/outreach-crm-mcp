import crypto from 'crypto';

const ENC_PREFIX = 'enc:';

function getKey(): Buffer | null {
    const key = process.env.TOKEN_ENCRYPTION_KEY;
    if (!key) return null;
    return crypto.createHash('sha256').update(key).digest();
}

export function encryptToken(value: string | null | undefined): string | null {
    if (!value) return null;
    const key = getKey();
    if (!key) return value;

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${ENC_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptToken(value: string | null | undefined): string | null {
    if (!value) return null;
    if (!value.startsWith(ENC_PREFIX)) return value;

    const key = getKey();
    if (!key) return value;

    const payload = value.slice(ENC_PREFIX.length);
    const [ivB64, tagB64, dataB64] = payload.split(':');
    if (!ivB64 || !tagB64 || !dataB64) return null;

    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
}
