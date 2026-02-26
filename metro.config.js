const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Add support for resolving modules
config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [path.resolve(__dirname, 'node_modules'), path.resolve(__dirname)],
  sourceExts: [...(config.resolver.sourceExts || []), 'svg'],
  resolverMainFields: ['react-native', 'browser', 'main'],
  extraNodeModules: {
    '@': path.resolve(__dirname),
  },
};

module.exports = config;
