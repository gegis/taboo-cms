module.exports = {
  port: 3000,
  eventsMaxListeners: 100,
  appDir: 'app',
  configDir: 'config',
  modulesDir: 'app/modules',
  publicDir: 'public',
  policiesDir: 'app/policies',
  localesDir: 'app/locales',
  adminLocalesDir: 'app/locales/admin',
  emailTemplatesDir: 'app/templates/emails',
  dbAdaptersDir: 'app/db/adapters',
  dbMigrationsDir: 'app/db/migrations',
  secretKeys: ['replace me 1', 'replace me 2'],
  bcryptSaltRounds: 10,
  globalPolicies: [],
  modules: {
    configFile: 'module.config.js',
    viewsDir: 'views',
    defaultView: 'index',
    controllersDir: 'controllers',
    modelsDir: 'models',
    servicesDir: 'services',
    helpersDir: 'helpers',
    clientDir: 'client',
    adminClientConfigFile: 'adminClientConfig.js',
  },
  views: {
    defaultPageTitle: 'Taboo CMS',
    extension: 'html',
    layoutsDir: 'app/templates/layouts',
    defaultLayout: 'default',
    errorsDir: 'app/templates/error',
    defaultErrorLayout: 'error',
    defaultErrorView: 'index',
  },
  uploads: {
    serveStaticDir: 'public',
    uploadsDir: 'public/uploads',
    urlPath: '/uploads',
    allowedTypes: [
      'image/png',
      'image/jpg',
      'image/jpeg',
      'image/gif',
      'video/webm',
      'video/mp4',
      'video/x-matroska',
      'application/pdf',
    ],
    maxFileSize: 500 * 1024 * 1024,
    appendTimestamp: true,
  },
  doubleFileExtensions: ['tar'],
  cors: {
    enabled: false,
    options: {},
  },
  session: {
    store: 'cookie', // 'cookie' || CustomSessionClass
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
  silentErrors: ['UnauthorizedError', 'BadRequestError', 'ForbiddenError', 'ValidationError', 'NotFoundError'],
  ejsOptions: {
    root: `${process.cwd()}/app/`,
  },
};
