module.exports = {
  port: 3000,
  eventsMaxListeners: 100,
  configDir: 'config',
  publicDir: 'public',
  appDir: 'app',
  secretKeys: ['replace me 1', 'replace me 2'],
  modules: {
    configFile: 'config.js',
    viewsDir: 'views',
    viewsExtension: 'html',
    defaultView: 'index.html',
  },
  views: {
    defaultPageTitle: 'Taboo CMS',
    layoutsDir: 'views/layouts',
    defaultLayout: 'default.html',
    errorsDir: 'views/error',
    defaultErrorLayout: 'error.html',
    defaultErrorView: 'index.html',
  }
};
