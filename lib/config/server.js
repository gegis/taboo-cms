module.exports = {
  port: 3000,
  eventsMaxListeners: 100,
  appDir: 'app',
  configDir: 'config',
  modulesDir: 'app/modules',
  publicDir: 'public',
  policiesDir: 'app/policies',
  secretKeys: ['replace me 1', 'replace me 2'],
  bcryptSaltRounds: 10,
  modules: {
    configFile: 'config.js',
    viewsDir: 'views',
    defaultView: 'index',
    controllersDir: 'controllers',
    modelsDir: 'models',
    servicesDir: 'services',
  },
  views: {
    defaultPageTitle: 'Taboo CMS',
    extension: 'html',
    layoutsDir: 'app/views/layouts',
    defaultLayout: 'default',
    errorsDir: 'app/views/error',
    defaultErrorLayout: 'error',
    defaultErrorView: 'index',
  },
  session: {
    store: 'mongodb', // 'cookie' || 'mongodb'
    options: {
      key: 'taboo.sid',
      maxAge: 86400000, // ms = 1 day
      autoCommit: true,
      overwrite: true,
      httpOnly: true,
      signed: true,
      rolling: true,
      renew: false,
      secure: false,
      encrypt: true,
    },
  },
  silentErrors: ['UnauthorizedError', 'BadRequestError', 'ForbiddenError'],
};
