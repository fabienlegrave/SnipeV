/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // Activer l'instrumentation pour exécuter du code au démarrage
  experimental: {
    instrumentationHook: true,
  },
  // Backend pur - pas besoin de config images
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
    
    // Externaliser Puppeteer et ses dépendances (ne pas les bundler)
    if (isServer) {
      // Externaliser tous les packages Puppeteer
      const puppeteerPackages = [
        'puppeteer',
        'puppeteer-core',
        'puppeteer-extra',
        'puppeteer-extra-plugin-stealth',
        'puppeteer-extra-plugin',
        'chrome-aws-lambda',
        'playwright',
      ];
      
      config.externals = config.externals || [];
      config.externals.push(({ request }, callback) => {
        // Externaliser si c'est un package Puppeteer ou une dépendance
        if (puppeteerPackages.some(pkg => request.includes(pkg))) {
          return callback(null, `commonjs ${request}`);
        }
        // Externaliser les dépendances de puppeteer dans node_modules
        if (request.includes('node_modules') && (
          request.includes('puppeteer') ||
          request.includes('clone-deep') ||
          request.includes('merge-deep')
        )) {
          return callback(null, `commonjs ${request}`);
        }
        callback();
      });
      
      // Ignorer les warnings pour clone-deep et autres dépendances de puppeteer
      config.ignoreWarnings = [
        ...(config.ignoreWarnings || []),
        { module: /node_modules\/clone-deep/ },
        { module: /node_modules\/puppeteer-extra-plugin-stealth/ },
        { module: /node_modules\/puppeteer-core/ },
        { module: /node_modules\/puppeteer/ },
        { module: /node_modules\/merge-deep/ },
      ];
    }
    
    return config;
  },
};

module.exports = nextConfig;