const path = require('path');
const Logger = require('./Logger');
const FilesHelper = require('./FilesHelper');

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

  getRouterRouteArgs(module, route) {
    const args = [route.path];
    args.push(this.getRouteInitialSetup(module, route));
    this.setupRoutePolicies(args, route);
    args.push(this.getRouteHandler(route));
    return args;
  }

  getRouteInitialSetup(module, route) {
    return async (ctx, next) => {
      ctx.taboo.module = {
        route: route,
        path: module.path,
      };
      if (route.options && route.options.errorResponseAsJson) {
        ctx.taboo.errorResponseAsJson = true;
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
}

module.exports = new CmsHelper();
