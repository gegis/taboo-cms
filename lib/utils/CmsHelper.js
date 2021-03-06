const path = require('path');
const ejs = require('ejs');
const Logger = require('./Logger');
const FilesHelper = require('./FilesHelper');
const EjsHelper = require('./EjsHelper');

class CmsHelper {
  constructor() {
    this.app = null;
    this.isAllowedImplementation = () => {
      Logger.warn('Requires ACL module implementation');
    };
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
    this.app.modules[moduleName] = {
      name: moduleName,
      path: modulePath,
      config: {},
      controllers: {},
      modelConfigs: {},
      models: {},
      services: {},
      helpers: {},
    };
    const module = this.app.modules[moduleName];
    const { modules: modulesConfig } = this.app.config.server;
    const moduleControllers = FilesHelper.getAllFileNames(path.join(modulePath, modulesConfig.controllersDir));
    const moduleModels = FilesHelper.getAllFileNames(path.join(modulePath, modulesConfig.modelsDir));
    const moduleServices = FilesHelper.getAllFileNames(path.join(modulePath, modulesConfig.servicesDir));
    const moduleHelpers = FilesHelper.getAllFileNames(path.join(modulePath, modulesConfig.helpersDir));
    try {
      // Order is important
      this.setupHelpers(module, moduleHelpers);
      this.setupModels(module, moduleModels);
      this.setupServices(module, moduleServices);
      this.setupControllers(module, moduleControllers);
      if (FilesHelper.fileExists(moduleConfigPath)) {
        module.config = require(moduleConfigPath);
      }
      if (module.config && module.config.afterModulesSetup) {
        this.app.afterModulesSetup.push(module.config.afterModulesSetup);
      }
      if (module.config && module.config.afterModelsSetup) {
        this.app.afterModelsSetup.push(module.config.afterModelsSetup);
      }
      this.parseAcl(module);
    } catch (e) {
      Logger.error(`Failed to load module '${moduleName}'`);
      Logger.error(e);
    }
  }

  parseAcl(module) {
    if (module.config && module.config.acl) {
      if (module.config.acl.isAllowedImplementation) {
        this.isAllowedImplementation = module.config.acl.isAllowedImplementation;
      }
      if (module.config.acl.resources) {
        module.config.acl.resources.map(resource => {
          if (this.app.aclResources.indexOf(resource) === -1) {
            this.app.aclResources.push(resource);
          } else {
            throw new Error(`ACL resource '${resource}' is already described, make sure it has a unique name`);
          }
        });
      }
    }
  }

  setupControllers(module, moduleControllers) {
    if (moduleControllers) {
      [...moduleControllers].map(name => {
        const prettyName = name.replace('Controller.', '.').replace('.js', '');
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
        const prettyName = name.replace('Model.', '.').replace('.js', '');
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
        const prettyName = name.replace('Service.', '.').replace('.js', '');
        module.services[prettyName] = require(path.join(module.path, this.app.config.server.modules.servicesDir, name));
      });
    }
  }

  setupHelpers(module, moduleHelpers) {
    if (moduleHelpers) {
      [...moduleHelpers].map(name => {
        const prettyName = name.replace('Helper.', '.').replace('.js', '');
        module.helpers[prettyName] = require(path.join(module.path, this.app.config.server.modules.helpersDir, name));
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
        if (route.options && route.options.aclResource) {
          ctx.taboo.aclResource = route.options.aclResource;
        }
      }
      return next();
    };
  }

  setupRoutePolicies(args, route) {
    const { globalPolicies = [] } = this.app.config.server;
    const { policies = [], options: { disableGlobalPolicies = false } = {} } = route;
    let allPolicies;
    if (disableGlobalPolicies) {
      allPolicies = policies;
    } else {
      allPolicies = globalPolicies.concat(policies);
    }
    if (allPolicies && allPolicies.length > 0) {
      allPolicies.map(policyName => {
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
    model = model.replace('Model', '');
    if (modules[module] && modules[module].models && modules[module].models[model]) {
      return modules[module].models[model];
    }
    return null;
  }

  getModuleController(module, controller) {
    const { modules } = this.app;
    controller = controller.replace('Controller', '');
    if (modules[module] && modules[module].controllers && modules[module].controllers[controller]) {
      return modules[module].controllers[controller];
    }
    return null;
  }

  getModuleService(module, service) {
    const { modules } = this.app;
    service = service.replace('Service', '');
    if (modules[module] && modules[module].services && modules[module].services[service]) {
      return modules[module].services[service];
    }
    return null;
  }

  getModuleHelper(module, helper) {
    const { modules } = this.app;
    helper = helper.replace('Helper', '');
    if (modules[module] && modules[module].helpers && modules[module].helpers[helper]) {
      return modules[module].helpers[helper];
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
    const { taboo = {} } = ctx;
    const clientConfig = this.getClientConfig(ctx);
    let viewParams = Object.assign(
      {
        _clientConfig: clientConfig,
        _clientConfigJson: JSON.stringify(clientConfig),
        _version: config.version,
        _env: config.environment,
        _debug: config.debug,
        pageTitle: config.server.views.defaultPageTitle,
        language: taboo.language,
        locale: taboo.locale,
        translations: taboo.translations,
        flashMessages: ctx.flashMessages,
      },
      params
    );
    const tplConfig = Object.assign(viewParams, {
      helpers: EjsHelper.getAllHelpers(viewParams),
    });
    ctx.set('Content-Language', viewParams.locale);
    tplConfig._body = ejs.render(pageTpl, tplConfig, config.server.ejsOptions);
    return ejs.render(layoutTpl, tplConfig, config.server.ejsOptions);
  }

  getClientConfig(ctx) {
    const { config } = this.app;
    const { taboo = {} } = ctx;
    return Object.assign(
      {},
      config.client,
      {
        env: config.environment,
        debug: config.debug,
        locale: taboo.locale,
        language: taboo.language,
        translations: taboo.translations,
        server: {
          port: config.server.port,
        },
        // sockets: {
        //   port: config.sockets.port,
        // },
      },
      taboo.clientConfig
    );
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

  setDefaultAdminLanguageParams(ctx) {
    const {
      i18n: { admin: i18nAdmin = {} },
    } = this.app.config;
    ctx.taboo.adminLanguage = i18nAdmin.defaultLanguage;
    ctx.taboo.adminLocale = i18nAdmin.defaultLocale;
    ctx.taboo.adminTranslations = {};
    if (this.app.adminLocales[ctx.taboo.adminLocale]) {
      ctx.taboo.adminTranslations = this.app.adminLocales[ctx.taboo.adminLocale];
    }
  }

  loadLocales(localesDir, localesNamespace = 'locales') {
    const localesPath = path.join(this.app.cwd, localesDir);
    const allLocales = FilesHelper.getAllFileNames(localesPath);
    if (allLocales) {
      [...allLocales].map(locale => {
        if (locale && locale.indexOf('.js') !== -1) {
          const localeName = locale.replace('.js', '');
          const localePath = path.join(this.app.cwd, localesDir, locale);
          try {
            this.app[localesNamespace][localeName] = require(localePath);
          } catch (e) {
            Logger.error(e);
          }
        }
      });
    }
  }

  getLocalesArray(admin = false) {
    const helper = {};
    const locales = [];
    const localesArray = [];
    const appLocales = admin ? this.app.adminLocales : this.app.locales;
    let item;
    for (let locale in appLocales) {
      if (locales.indexOf(locale) === -1) {
        locales.push(locale);
      }
      for (let key in appLocales[locale]) {
        if (!helper.hasOwnProperty(key)) {
          helper[key] = {};
        }
        helper[key][locale] = appLocales[locale][key];
      }
    }

    for (let key in helper) {
      item = {};
      item.key = key;
      locales.map(locale => {
        item[locale] = appLocales[locale][key];
      });
      localesArray.push(item);
    }

    return localesArray;
  }

  composeTemplate(ctx, tpl, params) {
    const { config } = this.app;
    const { taboo = {} } = ctx;
    const clientConfig = this.getClientConfig(ctx);
    let viewParams = Object.assign(
      {
        _clientConfig: clientConfig,
        _clientConfigJson: JSON.stringify(clientConfig),
        _version: config.version,
        _env: config.environment,
        _debug: config.debug,
        pageTitle: config.server.views.defaultPageTitle,
        language: taboo.language,
        locale: taboo.locale,
        translations: taboo.translations,
        flashMessages: ctx.flashMessages,
      },
      params
    );
    const tplConfig = Object.assign(viewParams, {
      helpers: EjsHelper.getAllHelpers(viewParams),
    });
    return ejs.render(tpl, tplConfig, config.server.ejsOptions);
  }

  isAllowed(subject, resource) {
    return this.isAllowedImplementation(subject, resource);
  }
}

module.exports = new CmsHelper();
