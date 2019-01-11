const Koa = require('koa');
const Router = require('koa-better-router');
const koaBody = require('koa-body');
const KeyGrip = require('keygrip');
const koaSession = require('koa-session');
const _ = require('lodash');
const serve = require('koa-static');
const config = require('./config');
const Logger = require('./utils/Logger');
const CmsHelper = require('./utils/CmsHelper');
const FilesHelper = require('./utils/FilesHelper');
const ApiHelper = require('./utils/ApiHelper');
const ArrayHelper = require('./utils/ArrayHelper');
const EventsEmitter = require('./utils/EventsEmitter');
const MongoDbAdapter = require('./utils/MongoDbAdapter');
const MongoDbSession = require('./utils/MongoDbSession');

class TabooCms {
  constructor() {
    this.app = {
      running: false,
      logger: Logger,
      cwd: process.cwd(),
      config: config,
      server: new Koa(),
      router: Router().loadMethods(),
      modules: {},
      policies: {},
      dbConnections: {},
      events: EventsEmitter,
    };
    this.start = this.start.bind(this);
  }

  async start() {
    // TODO investigate jwt
    if (this.app.running) {
      Logger.error('TabooCms is already running');
    } else {
      // The order below is important
      this.app.running = true;
      this.setupUtils();
      this.setupOnServerError();
      this.setupServerSecretKeys();
      this.setupStaticFiles();
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

  setupUtils() {
    Logger.setup(this.app.config);
    EventsEmitter.setup(this.app);
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
          errorResponse = await CmsHelper.getServerErrorResponse(err);
        }
        ctx.body = errorResponse;
        ctx.app.emit('error', err, ctx);
      }
    });
  }

  setupStaticFiles() {
    this.app.server.use(serve(this.app.config.server.publicDir));
  }

  setupMiddleware() {
    // Setup taboo and view objects on ctx object
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

    // Log incoming requests and times only for debug and development envs
    if (['debug', 'development'].indexOf(this.app.config.environment) !== -1) {
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
      if (connections.hasOwnProperty(name)) {
        config = connections[name];
        if (config && config.driver === 'mongodb') {
          this.app.dbConnections[name] = new MongoDbAdapter(config);
          await this.app.dbConnections[name].connect(config.options);
        }
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

  startServer() {
    return new Promise(resolve => {
      this.app.server.listen(this.app.config.server.port, () => {
        Logger.info(`Server is listening on port ${this.app.config.server.port}`);
        this.app.events.emit('server-started', this.app.server);
        resolve(this.app);
      });
    });
  }

  setupServerResponse() {
    this.app.server.use(async (ctx, next) => {
      if (ctx.err) {
        ctx.throw(500, ctx.err);
      } else if (ctx.route && !ctx.body) {
        return (ctx.body = await CmsHelper.getServerResponse(ctx));
      } else {
        await next();
      }
    });
  }
}

const taboo = new TabooCms();

module.exports = {
  start: taboo.start,
  logger: taboo.app.logger,
  config: taboo.app.config,
  events: taboo.app.events,
  getPage: (moduleRoute, viewName) => {
    return CmsHelper.getPage(moduleRoute, viewName);
  },
  getLayout: layoutName => {
    return CmsHelper.getLayout(layoutName);
  },
  getLayoutPath: layoutName => {
    return CmsHelper.getLayoutPath(layoutName);
  },
  composeResponse: (layoutTpl, pageTpl, params) => {
    return CmsHelper.composeResponse(layoutTpl, pageTpl, params);
  },
  getModel: (module, model) => {
    return CmsHelper.getModuleModel(module, model);
  },
  getController: (module, controller) => {
    return CmsHelper.getModuleController(module, controller);
  },
  getService: (module, service) => {
    return CmsHelper.getModuleService(module, service);
  },
  parseApiRequestParams: (requestParams, paramsList) => {
    return ApiHelper.parseRequestParams(requestParams, paramsList);
  },
  cleanTimestamps: data => {
    ApiHelper.cleanTimestamps(data);
  },
};
