const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Monorepo Metro config: this app lives in apps/mobile, while the shared
// packages (@cutishop1/contracts, @cutishop1/api-client) live in
// packages/* and are linked through the workspace root node_modules.
// Metro must watch the repo root and resolve node_modules from both the
// app and the root, otherwise imports of the shared TS sources fail.
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
