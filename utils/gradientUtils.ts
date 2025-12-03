/**
 * Gradient utility for generating consistent user-based gradients
 */

// Predefined gradient color pairs for a vibrant, modern look
const GRADIENT_PALETTES = [
    ['#667eea', '#764ba2'], // Purple-Blue
    ['#f093fb', '#f5576c'], // Pink-Red
    ['#4facfe', '#00f2fe'], // Light Blue-Cyan
    ['#43e97b', '#38f9d7'], // Green-Teal
    ['#fa709a', '#fee140'], // Pink-Yellow
    ['#30cfd0', '#330867'], // Cyan-Purple
    ['#a8edea', '#fed6e3'], // Teal-Pink
    ['#ff9a9e', '#fecfef'], // Coral-Pink
    ['#ffecd2', '#fcb69f'], // Peach
    ['#ff6e7f', '#bfe9ff'], // Red-Blue
    ['#e0c3fc', '#8ec5fc'], // Lavender-Blue
    ['#f8b500', '#fceabb'], // Gold-Cream
];

/**
 * Generate a consistent hash from a string
 */
function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

/**
 * Get gradient colors for a user based on their identifier
 * @param userId User ID or name to generate gradient from
 * @returns Array of two hex colors [startColor, endColor]
 */
export function getUserGradient(userId: string = 'default'): [string, string] {
    const hash = hashString(userId);
    const index = hash % GRADIENT_PALETTES.length;
    return GRADIENT_PALETTES[index] as [string, string];
}

/**
 * Get gradient style object for React Native LinearGradient
 * @param userId User ID or name to generate gradient from
 * @returns Object with colors array and default props
 */
export function getGradientStyle(userId: string = 'default') {
    const [startColor, endColor] = getUserGradient(userId);
    return {
        colors: [startColor, endColor],
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
    };
}

/**
 * Get gradient as CSS string for web/styles
 * @param userId User ID or name to generate gradient from
 * @returns CSS linear-gradient string
 */
export function getGradientCSS(userId: string = 'default'): string {
    const [startColor, endColor] = getUserGradient(userId);
    return `linear-gradient(135deg, ${startColor} 0%, ${endColor} 100%)`;
}
