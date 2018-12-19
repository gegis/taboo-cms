module.exports = {
  port: 3000,
  eventsMaxListeners: 100,
  appDir: 'app',
  configDir: 'config',
  modulesDir: 'app/modules',
  publicDir: 'public',
  secretKeys: ['replace me 1', 'replace me 2'],
  modules: {
    configFile: 'config.js',
    viewsDir: 'views',
    viewsExtension: 'html',
    defaultView: 'index.html',
  },
  views: {
    defaultPageTitle: 'Taboo CMS',
    layoutsDir: 'app/views/layouts',
    defaultLayout: 'default.html',
    errorsDir: 'app/views/error',
    defaultErrorLayout: 'error.html',
    defaultErrorView: 'index.html',
  },
};
