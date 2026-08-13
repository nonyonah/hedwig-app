export interface ResolvedProfileIcon {
    emoji?: string;
    colorIndex?: number;
    imageUri?: string;
}

const IMAGE_URI_PREFIXES = ['data:', 'http://', 'https://', 'file://', 'content://', 'blob:'];

const EMOJI_CHAR_RE =
    /[\u{1F000}-\u{1FAFF}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{23E9}-\u{23F3}\u{FE0F}\u{200D}\u{20E3}]/u;

function looksLikeImage(input: string): boolean {
    return IMAGE_URI_PREFIXES.some((prefix) => input.startsWith(prefix));
}

/**
 * Parses a stored avatar into a safe { imageUri?, emoji? } payload.
 * Avatars can be a base64/hosted image URL, a JSON blob ({ imageUri?, emoji? }),
 * or a raw emoji string. Never treat a bare emoji as an image URI — that makes
 * RCTImageLoader log "No suitable image URL loader found for emoji:…".
 */
export function parseAvatar(avatar: string | null | undefined): ResolvedProfileIcon {
    const raw = (avatar || '').trim();
    if (!raw) return {};

    if (looksLikeImage(raw)) {
        return { imageUri: raw };
    }

    if (raw.startsWith('{')) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                const imageUri =
                    typeof parsed.imageUri === 'string' && looksLikeImage(parsed.imageUri)
                        ? parsed.imageUri
                        : undefined;
                const emoji = typeof parsed.emoji === 'string' && parsed.emoji ? parsed.emoji : undefined;
                const colorIndex = typeof parsed.colorIndex === 'number' ? parsed.colorIndex : undefined;
                if (imageUri || emoji || colorIndex !== undefined) {
                    return { imageUri, emoji, colorIndex };
                }
            }
        } catch {
            // fall through to emoji detection
        }
    }

    if (EMOJI_CHAR_RE.test(raw) && raw.length <= 8) {
        return { emoji: raw };
    }

    return {};
}

/** Combines avatar/profileEmoji/profileColorIndex fields into a single safe icon state. */
export function resolveProfileIcon(input: {
    avatar?: string | null;
    profileEmoji?: string | null;
    profileColorIndex?: number | null;
}): ResolvedProfileIcon {
    const fromAvatar = parseAvatar(input.avatar);
    if (fromAvatar.imageUri || fromAvatar.emoji || fromAvatar.colorIndex !== undefined) return fromAvatar;

    if (input.profileEmoji) return { emoji: input.profileEmoji };
    if (typeof input.profileColorIndex === 'number') return { colorIndex: input.profileColorIndex as number};
    return {};
}