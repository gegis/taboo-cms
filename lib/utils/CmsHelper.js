const path = require('path');
const Handlebars = require('handlebars');
const Logger = require('./Logger');
const FilesHelper = require('./FilesHelper');
const HandlebarsHelper = require('./HandlebarsHelper');

class CmsHelper {
  constructor() {
    this.app = null;
  }

  setup(app) {
    this.app = app;
  }

  getAllModuleNames() {
    return FilesHelper.getAllDirNames(path.join(this.app.cwd, this.app.config.server.modulesDir));
  }

  setupAllModules() {
    const moduleNames = this.getAllModuleNames();
    moduleNames.map(this.getModuleSetup.bind(this));
  }

  getModuleSetup(moduleName) {
    const modulePath = path.join(this.app.cwd, this.app.config.server.modulesDir, moduleName);
    const moduleConfigPath = path.join(modulePath, this.app.config.server.modules.configFile);
    const module = {
      name: moduleName,
      path: modulePath,
      config: {},
      controllers: {},
      modelConfigs: {},
      models: {},
      services: {},
    };
    const { modules: modulesConfig } = this.app.config.server;
    const moduleControllers = FilesHelper.getAllFileNames(path.join(modulePath, modulesConfig.controllersDir));
    const moduleModels = FilesHelper.getAllFileNames(path.join(modulePath, modulesConfig.modelsDir));
    const moduleServices = FilesHelper.getAllFileNames(path.join(modulePath, modulesConfig.servicesDir));
    try {
      module.config = require(moduleConfigPath);
      this.setupControllers(module, moduleControllers);
      this.setupModels(module, moduleModels);
      this.setupServices(module, moduleServices);
    } catch (e) {
      Logger.error(`Failed to load module '${moduleName}'`);
      Logger.error(e);
    }
    this.app.modules[moduleName] = module;
  }

  setupControllers(module, moduleControllers) {
    if (moduleControllers) {
      [...moduleControllers].map(name => {
        const prettyName = name.replace('Controller.js', '');
        module.controllers[prettyName] = require(path.join(
          module.path,
          this.app.config.server.modules.controllersDir,
          name
        ));
      });
    }
  }

  setupModels(module, moduleModels) {
    if (moduleModels) {
      [...moduleModels].map(name => {
        const prettyName = name.replace('Model.js', '');
        module.modelConfigs[prettyName] = require(path.join(
          module.path,
          this.app.config.server.modules.modelsDir,
          name
        ));
      });
    }
  }

  setupServices(module, moduleServices) {
    if (moduleServices) {
      [...moduleServices].map(name => {
        const prettyName = name.replace('Service.js', '');
        module.services[prettyName] = require(path.join(module.path, this.app.config.server.modules.servicesDir, name));
      });
    }
  }

  setupPolicies() {
    const policies = FilesHelper.getAllFileNames(path.join(this.app.cwd, this.app.config.server.policiesDir));
    if (policies) {
      [...policies].map(policy => {
        try {
          let prettyName = policy.replace('.js', '');
          this.app.policies[prettyName] = require(path.join(this.app.cwd, this.app.config.server.policiesDir, policy));
        } catch (e) {
          Logger.error('Error loading policy', e);
        }
      });
    }
  }

  getRouterRouteArgs(route) {
    const args = [];
    args.push(this.getRouteInitialSetup(route));
    this.setupRoutePolicies(args, route);
    args.push(this.getRouteHandler(route));
    return args;
  }

  getRouteInitialSetup(route) {
    return async (ctx, next) => {
      if (ctx.route) {
        ctx.taboo.moduleRoute = route;
        if (route.options && route.options.errorResponseAsJson) {
          ctx.taboo.errorResponseAsJson = true;
        }
      }
      return next();
    };
  }

  setupRoutePolicies(args, route) {
    if (route.policies && route.policies.length > 0) {
      route.policies.map(policyName => {
        if (this.app.policies[policyName]) {
          args.push(this.app.policies[policyName]);
        }
      });
    }
  }

  getRouteHandler(route) {
    return route.action;
  }

  getModuleModel(module, model) {
    const { modules } = this.app;
    if (modules[module] && modules[module].models && modules[module].models[model]) {
      return modules[module].models[model];
    }
    return null;
  }

  getModuleController(module, controller) {
    const { modules } = this.app;
    if (modules[module] && modules[module].controllers && modules[module].controllers[controller]) {
      return modules[module].controllers[controller];
    }
    return null;
  }

  getModuleService(module, service) {
    const { modules } = this.app;
    if (modules[module] && modules[module].services && modules[module].services[service]) {
      return modules[module].services[service];
    }
    return null;
  }

  getPageViewPath(moduleRoute, viewName) {
    const { server } = this.app.config;
    let pagePath = null;
    let view;

    if (moduleRoute && moduleRoute.action && moduleRoute.action.name && moduleRoute.modulePath) {
      view = `${moduleRoute.action.name.replace('bound ', '')}`;
      if (viewName) {
        view = viewName;
      }
      pagePath = path.join(moduleRoute.modulePath, server.modules.viewsDir, `${view}.${server.views.extension}`);
      if (!FilesHelper.fileExists(pagePath)) {
        pagePath = path.join(
          moduleRoute.modulePath,
          server.modules.viewsDir,
          `${server.modules.defaultView}.${server.views.extension}`
        );
      }
    }

    return pagePath;
  }

  getLayoutPath(layoutName) {
    const { server } = this.app.config;
    const layout = layoutName || server.views.defaultLayout;
    return path.join(this.app.cwd, server.views.layoutsDir, `${layout}.${server.views.extension}`);
  }

  async getServerResponse(ctx) {
    const page = await this.getPage(ctx.taboo.moduleRoute, ctx.view._view);
    const layout = await this.getLayout(ctx.view._layout);
    return this.composeResponse(ctx, layout, page, ctx.view);
  }

  async getPage(moduleRoute, viewName) {
    const pagePath = this.getPageViewPath(moduleRoute, viewName);
    if (pagePath) {
      try {
        return await FilesHelper.readFile(pagePath);
      } catch (e) {
        Logger.error(e);
        throw Error('View not found');
      }
    }
  }

  async getLayout(layoutName) {
    const layoutPath = this.getLayoutPath(layoutName);
    try {
      return await FilesHelper.readFile(layoutPath);
    } catch (e) {
      Logger.error(e);
      throw Error('Layout not found');
    }
  }

  async getServerErrorResponse(err, ctx) {
    const page = await this.getErrorPage(err);
    const layout = await this.getErrorLayout(err);
    return this.composeResponse(ctx, layout, page, {
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

  composeResponse(ctx, layoutTpl, pageTpl, params) {
    const { config } = this.app;
    let pageTplCompiled, layoutTplCompiled;
    const tplConfig = Object.assign(
      {
        _clientConfig: this.getClientConfig(),
        _version: config.version,
        _title: config.server.views.defaultPageTitle,
        _env: config.environment,
      },
      {
        language: ctx.taboo.language,
        locale: ctx.taboo.locale,
        translations: ctx.taboo.translations,
        flashMessages: ctx.flashMessages,
      },
      params
    );
    HandlebarsHelper.registerAllHelpers();
    pageTplCompiled = Handlebars.compile(pageTpl);
    tplConfig._body = pageTplCompiled(tplConfig);
    layoutTplCompiled = Handlebars.compile(layoutTpl);
    return layoutTplCompiled(tplConfig);
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

  setDefaultLanguageParams(ctx) {
    const { i18n } = this.app.config;
    ctx.taboo.language = i18n.defaultLanguage;
    ctx.taboo.locale = i18n.defaultLocale;
    ctx.taboo.translations = {};
    if (this.app.locales[ctx.taboo.locale]) {
      ctx.taboo.translations = this.app.locales[ctx.taboo.locale];
    }
  }

  loadLocales() {
    const { localesDir } = this.app.config.server;
    const localesPath = path.join(this.app.cwd, localesDir);
    const allLocales = FilesHelper.getAllFileNames(localesPath);
    [...allLocales].map(locale => {
      const localeName = locale.replace('.js', '');
      const localePath = path.join(this.app.cwd, localesDir, locale);
      try {
        this.app.locales[localeName] = require(localePath);
      } catch (e) {
        Logger.error(e);
      }
    });
  }
}

module.exports = new CmsHelper();
