const Koa = require('koa');
const Router = require('koa-better-router');
const koaBody = require('koa-body');
const KeyGrip = require('keygrip');
const koaSession = require('koa-session');
const koaPassport = require('koa-passport');
const cors = require('koa-cors');
const _ = require('lodash');
const serve = require('koa-static');
const config = require('./config');
const Logger = require('./utils/Logger');
const CmsHelper = require('./utils/CmsHelper');
const FilesHelper = require('./utils/FilesHelper');
const EjsHelper = require('./utils/EjsHelper');
const ApiHelper = require('./utils/ApiHelper');
const ArrayHelper = require('./utils/ArrayHelper');
const EventsEmitter = require('./utils/EventsEmitter');
const Mailer = require('./utils/Mailer');

class TabooCms {
  constructor() {
    this.app = {
      running: false,
      logger: Logger,
      cwd: process.cwd(),
      config: config,
      server: new Koa(),
      router: Router().loadMethods(),
      routes: [],
      modules: {},
      policies: {},
      dbConnections: {},
      events: EventsEmitter,
      mailer: Mailer,
      locales: {},
      passport: null,
    };
    this.start = this.start.bind(this);
  }

  async start(customMiddlewareSetup) {
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
      this.loadLocales();
      await this.setupDb();
      this.setupMiddleware(customMiddlewareSetup);
      this.setupSession();
      // Setup passport after session
      this.setupPassport();
      this.setupPolicies();
      this.setupAppModules();
      await this.setupModels();
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
    EjsHelper.setup(this.app);
    FilesHelper.setup(this.app.config);
    ApiHelper.setup(this.app.config);
    Mailer.setup(this.app.config);
  }

  setupServerSecretKeys() {
    this.app.server.keys = new KeyGrip(this.app.config.server.secretKeys, 'sha256');
  }

  setupOnServerError() {
    const { silentErrors } = this.app.config.server;
    this.app.server.on('error', (err, ctx) => {
      if (silentErrors.indexOf(err.name) === -1) {
        Logger.error('Server error:');
        // Keep this whole ctx debug only for production to have more details to collect
        if (this.app.config.environment === 'production') {
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
        if (ctx.taboo && ctx.taboo.errorResponseAsJson) {
          errorResponse = {
            error: err,
            message: err.message,
          };
        } else {
          errorResponse = await CmsHelper.getServerErrorResponse(err, ctx);
        }
        ctx.body = errorResponse;
        ctx.app.emit('error', err, ctx);
      }
    });
  }

  setupStaticFiles() {
    this.app.server.use(serve(this.app.config.server.publicDir));
  }

  loadLocales() {
    CmsHelper.loadLocales();
  }

  setupMiddleware(customMiddlewareSetup) {
    const { enabled: corsEnabled = false, options: corsOptions } = this.app.config;
    // Setup taboo and view objects on ctx object
    this.app.server.use(async (ctx, next) => {
      ctx.view = {}; // template view, layout and view variables
      ctx.flashMessages = []; // flash messages for views
      ctx.taboo = {}; // taboo cms related configuration
      CmsHelper.setDefaultLanguageParams(ctx);
      await next();
    });

    if (corsEnabled) {
      this.app.server.use(cors(corsOptions));
    }

    // Body parser
    this.app.server.use(
      koaBody({
        multipart: true,
      })
    );

    if (customMiddlewareSetup && _.isFunction(customMiddlewareSetup)) {
      customMiddlewareSetup(this.app.server, this.app.config);
    }

    // Log incoming requests and times only for debug and development envs
    if (this.app.config.debug) {
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
    const { config, modules, logger } = this.app;
    let allRouteMethods = [];
    let allRoutes = [];
    let moduleName, module, methodAndPath;
    for (moduleName in modules) {
      if (modules.hasOwnProperty(moduleName)) {
        module = modules[moduleName];
        const { routes = [] } = module.config;
        routes.map(route => {
          if (!route.order) {
            route.order = 0;
          }
          route.modulePath = module.path;
          methodAndPath = `${route.method}:${route.path}`;
          if (config.environment !== 'production' && allRouteMethods.indexOf(methodAndPath) !== -1) {
            logger.warn(
              `Route with the following method '${route.method}' and path '${
                route.path
              }' already exists, please check the following route: \n`,
              route
            );
          }
          allRoutes.push(route);
          allRouteMethods.push(methodAndPath);
        });
      }
    }
    allRoutes = ArrayHelper.sortByProperty(allRoutes, 'order');
    this.app.routes = allRoutes;
    this.setupRoutes(allRoutes);
    this.app.server.use(this.app.router.middleware());
  }

  async setupDb() {
    const adapterMethods = {
      connect: 'connect() method which is either async or returns a Promise',
      setupModel: 'setupModel() method which is either async or returns a Promise',
    };
    const adapterProperties = {
      connection: 'connection',
      connectedTo: 'connectedTo',
    };
    const { connections } = this.app.config.db;
    let name, config;
    for (name in connections) {
      if (connections.hasOwnProperty(name)) {
        config = connections[name];
        if (config.adapter) {
          this.app.dbConnections[name] = new config.adapter(config);

          _.each(adapterMethods, (sample, method) => {
            if (!this.app.dbConnections[name][method] || !_.isFunction(this.app.dbConnections[name][method])) {
              throw Error(`Connection '${name}' adapter must implement ${sample}`);
            }
          });

          await this.app.dbConnections[name].connect(config);

          _.each(adapterProperties, (sample, property) => {
            if (!this.app.dbConnections[name][property]) {
              throw Error(`Connection '${name}' adapter must have '${sample}' property`);
            }
          });

          Logger.info(`Successfully established '${name}' connection: ${this.app.dbConnections[name].connectedTo}`);
        }
      }
    }
  }

  async setupModels() {
    const { modules, dbConnections } = this.app;
    let moduleName, module, modelName, modelConfig;
    for (moduleName in modules) {
      module = modules[moduleName];
      if (!module.models) {
        module.models = {};
      }
      if (module.modelConfigs && _.size(module.modelConfigs) > 0) {
        for (modelName in module.modelConfigs) {
          modelConfig = module.modelConfigs[modelName];
          if (dbConnections[modelConfig.connection]) {
            module.models[modelName] = await dbConnections[modelConfig.connection].setupModel(modelName, modelConfig);
          }
        }
      }
    }
  }

  setupSession() {
    const customStoreMethods = {
      get: 'get(key)',
      set: 'set(key, value, maxAge, options)',
      destroy: 'destroy(key)',
    };
    const { session } = this.app.config.server;
    // TODO implement custom session.options.encode and session.options.decode methods
    if (session.store && session.store !== 'cookie') {
      session.options.store = new session.store(session.options);
      _.each(customStoreMethods, (sample, method) => {
        if (!session.options.store[method] || !_.isFunction(session.options.store[method])) {
          throw Error(`Session must implement ${sample} method`);
        }
      });
    }
    this.app.server.use(koaSession(session.options, this.app.server));
  }

  setupPassport() {
    const { passport } = this.app.config;
    if (passport.setupStrategiesMethod && _.size(passport.strategies) > 0) {
      this.app.passport = koaPassport;
      passport.setupStrategiesMethod(this.app.passport, this.app.config);
      this.app.server.use(this.app.passport.initialize());
      this.app.server.use(this.app.passport.session());
    }
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

  getDbConnection(connectionName) {
    if (taboo.app.dbConnections[connectionName]) {
      return taboo.app.dbConnections[connectionName];
    }
    return null;
  }
}

const taboo = new TabooCms();

module.exports = {
  start: taboo.start,
  cwd: taboo.app.cwd,
  _: _,
  logger: taboo.app.logger,
  config: taboo.app.config,
  events: taboo.app.events,
  mailer: taboo.app.mailer,
  locales: taboo.app.locales,
  getPassport: () => {
    return taboo.app.passport;
  },
  getDbConnection: taboo.getDbConnection,
  getPage: (moduleRoute, viewName) => {
    return CmsHelper.getPage(moduleRoute, viewName);
  },
  getLayout: layoutName => {
    return CmsHelper.getLayout(layoutName);
  },
  getLayoutPath: layoutName => {
    return CmsHelper.getLayoutPath(layoutName);
  },
  composeResponse: (ctx, layoutTpl, pageTpl, params) => {
    return CmsHelper.composeResponse(ctx, layoutTpl, pageTpl, params);
  },
  getModel: (module, model) => {
    return CmsHelper.getModuleModel(module, model);
  },
  Model: moduleModel => {
    const params = moduleModel.split('.');
    if (params.length !== 2) {
      throw new Error('Please specify module and model: "module.Model"');
    }
    return CmsHelper.getModuleModel(...params);
  },
  getController: (module, controller) => {
    return CmsHelper.getModuleController(module, controller);
  },
  Controller: moduleController => {
    const params = moduleController.split('.');
    if (params.length !== 2) {
      throw new Error('Please specify module and controller: "module.Controller"');
    }
    return CmsHelper.getModuleController(...params);
  },
  getService: (module, service) => {
    return CmsHelper.getModuleService(module, service);
  },
  Service: moduleService => {
    const params = moduleService.split('.');
    if (params.length !== 2) {
      throw new Error('Please specify module and service: "module.Service"');
    }
    return CmsHelper.getModuleService(...params);
  },
  getHelper: (module, helper) => {
    return CmsHelper.getModuleHelper(module, helper);
  },
  Helper: moduleHelper => {
    const params = moduleHelper.split('.');
    if (params.length !== 2) {
      throw new Error('Please specify module and helper: "module.Helper"');
    }
    return CmsHelper.getModuleHelper(...params);
  },
  parseApiRequestParams: (requestParams, paramsList) => {
    return ApiHelper.parseRequestParams(requestParams, paramsList);
  },
  cleanTimestamps: data => {
    ApiHelper.cleanTimestamps(data);
  },
  getMissingTranslations: () => {
    return EjsHelper.getMissingTranslations();
  },
  getAllRoutes() {
    return taboo.app.routes;
  },
  getAllModules() {
    return taboo.app.modules;
  },
  getLocalesArray() {
    return CmsHelper.getLocalesArray();
  },
};
