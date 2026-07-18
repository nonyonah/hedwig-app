import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Hedwig',
    short_name: 'Hedwig',
    description: 'Freelancer operating system for projects, payments, deadlines, and subscription workflows.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2563eb',
    orientation: 'portrait',
    icons: [
      {
        src: '/hedwig-icon.png',
        sizes: '1024x1024',
        type: 'image/png',
      },
      {
        src: '/hedwig-icon.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/hedwig-icon.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/hedwig-icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    categories: ['finance', 'business', 'productivity'],
  };
}
