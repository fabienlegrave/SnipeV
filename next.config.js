/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    domains: ['images1.vinted.net', 'images2.vinted.net', 'via.placeholder.com'],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Completely exclude server-only modules from client bundle
      config.resolve.alias = {
        ...config.resolve.alias,
        '@/lib/scrape/serverOnlyParser': false,
      };
      
      config.resolve.fallback = {
        ...config.resolve.fallback,
        '@/lib/scrape/serverOnlyParser': false,
      };
    }
    
    // Ignorer les modules problématiques lors de l'analyse statique
    if (isServer) {
      // Ignorer les warnings pour clone-deep et autres dépendances de puppeteer
      config.ignoreWarnings = [
        ...(config.ignoreWarnings || []),
        { module: /node_modules\/clone-deep/ },
        { module: /node_modules\/puppeteer-extra-plugin-stealth/ },
      ];
    }
    
    return config;
  },
};

module.exports = nextConfig;