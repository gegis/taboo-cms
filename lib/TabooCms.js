const { EventEmitter } = require('events');
const Koa = require('koa');
const Router = require('koa-better-router');
const koaBody = require('koa-body');
const KeyGrip = require('keygrip');
const path = require('path');
const koaSession = require('koa-session');
const _ = require('lodash');
const serve = require('koa-static');
const Mustache = require('mustache');
const config = require('./config');
const Logger = require('./utils/Logger');
const CmsHelper = require('./utils/CmsHelper');
const FilesHelper = require('./utils/FilesHelper');
const ApiHelper = require('./utils/ApiHelper');
const ArrayHelper = require('./utils/ArrayHelper');
const MongoDbAdapter = require('./utils/MongoDbAdapter');
const MongoDbSession = require('./utils/MongoDbSession');

class TabooCms extends EventEmitter {
  constructor() {
    super();
    // TODO investigate jwt
    this.app = {
      running: false,
      cwd: process.cwd(),
      config: config,
      server: new Koa(),
      router: Router().loadMethods(),
      modules: {},
      policies: {},
      dbConnections: {},
    };
    this.unmatchedRoutes = null;
    this.setMaxListeners(this.app.config.server.eventsMaxListeners);
  }

  async start() {
    if (this.app.running) {
      Logger.error('TabooCms is already running');
    } else {
      // The order below is very important
      this.app.running = true;
      this.setupUtils();
      this.setupOnServerError();
      this.setupServerSecretKeys();
      this.setupStatic();
      await this.setupDb();
      this.setupMiddleware();
      this.setupSession();
      this.setupPolicies();
      this.setupAppModules();
      this.setupModels();
      this.setupServerResponse();
      await this.startServer();
      // TODO implement sockets server
      // this.socketsServer.start(this.app);
    }
    return this.app;
  }

  getConfig() {
    return this.app.config;
  }

  getModel(module, model) {
    return CmsHelper.getModuleModel(module, model);
  }

  getController(module, controller) {
    return CmsHelper.getModuleController(module, controller);
  }

  getService(module, service) {
    return CmsHelper.getModuleService(module, service);
  }

  getLogger() {
    return Logger;
  }

  parseApiRequestParams(requestParams, paramsList) {
    return ApiHelper.parseRequestParams(requestParams, paramsList);
  }

  getLayoutPath(layout) {
    return CmsHelper.getLayoutPath(layout);
  }

  cleanTimestamps(data) {
    ApiHelper.cleanTimestamps(data);
  }

  setupUtils() {
    Logger.setup(this.app.config);
    CmsHelper.setup(this.app);
    FilesHelper.setup(this.app.config);
    ApiHelper.setup(this.app.config);
  }

  setupServerSecretKeys() {
    this.app.server.keys = new KeyGrip(this.app.config.server.secretKeys, 'sha256');
  }

  setupOnServerError() {
    const { silentErrors } = this.app.config.server;
    this.app.server.on('error', (err, ctx) => {
      if (silentErrors.indexOf(err.name) === -1) {
        Logger.error('Server error:');
        if (['debug', 'production'].indexOf(this.app.config.environment) !== -1) {
          Logger.error(ctx);
        }
        Logger.error(err);
      }
    });

    this.app.server.use(async (ctx, next) => {
      let errorResponse;
      try {
        await next();
      } catch (err) {
        ctx.status = err.status || 500;
        if (ctx.taboo.errorResponseAsJson) {
          errorResponse = {
            error: err,
            message: err.message,
          };
        } else {
          errorResponse = await this.getServerErrorResponse(err);
        }
        ctx.body = errorResponse;
        ctx.app.emit('error', err, ctx);
      }
    });
  }

  setupMiddleware() {
    // Setup taboo object on ctx object
    this.app.server.use(async (ctx, next) => {
      ctx.taboo = {};
      ctx.view = {};
      await next();
    });

    // Body parser
    this.app.server.use(
      koaBody({
        multipart: true,
      })
    );

    // Log incoming requests and times only for debug and develop envs
    if (['debug', 'develop'].indexOf(this.app.config.environment) !== -1) {
      this.app.server.use(async (ctx, next) => {
        const start = Date.now();
        await next();
        const ms = Date.now() - start;
        Logger.info(`${ctx.method} ${ctx.url} - ${ms} ms`);
      });
    }
  }

  setupAppModules() {
    CmsHelper.setupAllModules();
    let allRoutes = [];
    let moduleName, module;
    for (moduleName in this.app.modules) {
      module = this.app.modules[moduleName];
      const { routes = [] } = module.config;
      routes.map(route => {
        if (!route.order) {
          route.order = 0;
        }
        route.modulePath = module.path;
        allRoutes.push(route);
      });
    }
    allRoutes = ArrayHelper.sortByProperty(allRoutes, 'order');
    this.setupRoutes(allRoutes);
    this.app.server.use(this.app.router.middleware());
  }

  async setupDb() {
    const { connections } = this.app.config.db;
    let name, config;
    for (name in connections) {
      config = connections[name];
      if (config && config.driver === 'mongodb') {
        this.app.dbConnections[name] = new MongoDbAdapter(config);
        await this.app.dbConnections[name].connect(config.options);
      }
    }
  }

  setupModels() {
    const { modules, dbConnections } = this.app;
    let name, module, modelName, modelConfig;
    for (name in modules) {
      module = modules[name];
      if (module.modelConfigs && _.size(module.modelConfigs) > 0) {
        for (modelName in module.modelConfigs) {
          modelConfig = module.modelConfigs[modelName];
          dbConnections[modelConfig.connection].setupModel(module, modelConfig, modelName);
        }
      }
    }
  }

  setupSession() {
    const driverName = 'mongodb';
    const { session } = this.app.config.server;
    const { connections = {} } = this.app.config.db;
    let mongodbConnectionExists = false;
    let connectionKey;
    // TODO implement custom session.encode and session.decode methods
    // TODO ALLOW custom implementations for session.options.store
    if (session.store === driverName) {
      for (connectionKey in connections) {
        if (connections[connectionKey].driver === driverName) {
          mongodbConnectionExists = true;
        }
      }
      if (mongodbConnectionExists) {
        session.options.store = new MongoDbSession({
          name: 'Session',
          expires: parseInt(session.options.maxAge / 1000),
        });
      }
    }
    this.app.server.use(koaSession(session.options, this.app.server));
  }

  setupPolicies() {
    CmsHelper.setupPolicies();
  }

  setupRoutes(routes) {
    routes.map(route => {
      this.app.router[route.method.toLowerCase()](route.path, CmsHelper.getRouterRouteArgs(route));
    });
  }

  setupStatic() {
    this.app.server.use(serve(this.app.config.server.publicDir));
  }

  startServer() {
    return new Promise(resolve => {
      this.app.server.listen(this.app.config.server.port, () => {
        Logger.info(`Server is listening on port ${this.app.config.server.port}`);
        this.emit('server-started', this.app);
        resolve(this.app);
      });
    });
  }

  setupServerResponse() {
    this.app.server.use(async (ctx, next) => {
      if (ctx.err) {
        ctx.throw(500, ctx.err);
      } else if (ctx.route && !ctx.body) {
        return (ctx.body = await this.getServerResponse(ctx));
      } else {
        await next();
      }
    });
  }

  async getServerResponse(ctx) {
    const page = await this.getPage(ctx, ctx.taboo.module, ctx.view._view);
    const layout = await this.getLayout(ctx, ctx.view._layout);
    return this.composeResponse(layout, page, ctx.view);
  }

  async getPage(ctx, module, viewName) {
    const pagePath = CmsHelper.getPageViewPath(module, viewName);
    if (pagePath) {
      try {
        return await FilesHelper.readFile(pagePath);
      } catch (e) {
        Logger.error(e);
        ctx.throw(500, 'View not found');
      }
    }
  }

  async getLayout(ctx, layoutName) {
    const layoutPath = CmsHelper.getLayoutPath(layoutName);
    try {
      return await FilesHelper.readFile(layoutPath);
    } catch (e) {
      Logger.error(e);
      ctx.throw(500, 'Layout not found');
    }
  }

  async getServerErrorResponse(err) {
    const page = await this.getErrorPage(err);
    const layout = await this.getErrorLayout(err);
    return this.composeResponse(layout, page, {
      error: err.message,
    });
  }

  async getErrorPage(err) {
    const {
      server: { views },
    } = this.app.config;
    let errorPage = `${views.defaultErrorView}.${views.extension}`;
    let errorStatusPage = `${err.status}.${views.extension}`;
    let pagePath;
    if (err.status && FilesHelper.fileExists(path.join(this.app.cwd, views.errorsDir, errorStatusPage))) {
      errorPage = errorStatusPage;
    }
    try {
      pagePath = path.join(this.app.cwd, views.errorsDir, errorPage);
      return await FilesHelper.readFile(pagePath);
    } catch (e) {
      Logger.error(e);
      pagePath = path.join(this.app.cwd, views.errorsDir, views.defaultErrorView);
      return FilesHelper.readFile(pagePath);
    }
  }

  async getErrorLayout(err, ctx) {
    const { views } = this.app.config.server;
    const layoutPath = path.join(this.app.cwd, views.layoutsDir, `${views.defaultErrorLayout}.${views.extension}`);
    try {
      return await FilesHelper.readFile(layoutPath);
    } catch (e) {
      ctx.status = 500;
      ctx.body = e.message;
    }
  }

  composeResponse(layoutTpl, pageTpl, params) {
    const { config } = this.app;
    const tplConfig = Object.assign(
      {
        _clientConfig: this.getClientConfig(),
        _version: config.version,
        _title: config.server.views.defaultPageTitle,
        _env: config.environment,
      },
      params
    );
    tplConfig._body = Mustache.render(pageTpl, tplConfig);
    return Mustache.render(layoutTpl, tplConfig);
  }

  getClientConfig() {
    const { config } = this.app;
    const clientConfig = Object.assign(config.client, {
      env: config.environment,
      server: {
        port: config.server.port,
      },
      // sockets: {
      //   port: config.sockets.port,
      // },
    });
    return JSON.stringify(clientConfig);
  }
}

module.exports = new TabooCms();
