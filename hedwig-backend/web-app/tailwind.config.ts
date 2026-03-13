import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))'
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.5rem'
      },
      boxShadow: {
        panel: '0 20px 60px -24px rgba(7, 9, 20, 0.35)',
        inset: 'inset 0 1px 0 rgba(255,255,255,0.03)'
      },
      backgroundImage: {
        grid: 'linear-gradient(to right, rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.08) 1px, transparent 1px)',
        hero: 'radial-gradient(circle at top left, rgba(20,184,166,0.22), transparent 28%), radial-gradient(circle at top right, rgba(59,130,246,0.18), transparent 24%), linear-gradient(180deg, rgba(15,23,42,0.94) 0%, rgba(2,6,23,1) 100%)'
      }
    }
  },
  plugins: []
};

export default config;
