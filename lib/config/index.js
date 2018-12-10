const _ = require('lodash');
const path = require('path');
const appPackageJson = require(path.join(process.cwd(), 'package.json'));

// Configs
const server = require('./server.js');
const logger = require('./logger.js');

// Default environment value, it can be set in local.js or passed as process.env.NODE_ENV
let env = 'develop';

//Get default configs
let config = {
  server,
  logger,
};

//Get local config
let local;
let envConfigPath;

try {
  local = require(path.join(process.cwd(), config.server.configDir, 'local.js'));
} catch(e) {
  //TODO for now do not throw an error
  local = {};
  console.error(e);
  console.error("Make sure you copied 'SAMPLE.local.js' file and renamed it to 'local.js' inside 'config' folder");
  // throw new Error("Make sure you copied 'SAMPLE.local.js' file and renamed it to 'local.js' inside 'config' folder");
}

//Set env from local, if there is one
if (local.environment) {
  env = local.environment;
}

//Set env from process.env.NODE_ENV if passed
if(process.env.NODE_ENV) {
  env = process.env.NODE_ENV;
}

console.info('Selected Environment:', env);
envConfigPath = path.join(process.cwd(), config.server.configDir,  `/environment/${env}.js`);

try {
  // Merge Environment Specific Configuration
  _.merge(config, require(envConfigPath));
} catch(e) {
  //TODO for now do not throw an error
  console.error(`Environment config file not found: '${envConfigPath}'`);
  // throw new Error(`Environment config file not found: './environment/${env}.js'`);
}

// Overwrite if there is anything from local.js
_.merge(config, local);

//Set version from package.json
config.version = appPackageJson.version;

// We need to set it last, if just in case it was passed as process.env.NODE_ENV
config.environment = env;

module.exports = config;
