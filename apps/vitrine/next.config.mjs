/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile le package core du monorepo (fichiers TS bruts, pas de dist publié)
  transpilePackages: ["@sentio/vitrine-core"],
  webpack: (config) => {
    // Le noyau (tsconfig NodeNext) importe avec extension ".js" — obligatoire
    // pour tsc en NodeNext, même si la source est ".ts". Webpack, lui, résout
    // littéralement ".js" sans repli automatique vers ".ts" pour un package
    // transpilé à la volée : on ajoute le mapping explicite.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
