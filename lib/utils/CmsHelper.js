const { readdirSync, statSync } = require('fs-extra');
const path = require('path');

class CmsHelper {
  constructor() {
    this.app = null;
  }

  setup(app) {
    this.app = app;
  }

  getAllModules() {
    return readdirSync(path.join(this.app.cwd, this.app.config.server.modulesDir)).filter(f => {
      return statSync(path.join(this.app.cwd, this.app.config.server.modulesDir, f)).isDirectory();
    });
  }

  getAllModulesPaths() {
    const modules = this.getAllModules();
    return modules.map(module => {
      let modulePath = path.join(this.app.cwd, this.app.config.server.modulesDir, module);
      let moduleConfigPath = path.join(modulePath, this.app.config.server.modules.configFile);
      return {
        name: module,
        path: modulePath,
        configFile: moduleConfigPath,
      };
    });
  }

  getModuleModel(modelString) {
    const [module, model] = modelString.split('.');
    if (this.app.modules[module] && this.app.modules[module].models && this.app.modules[module].models[model]) {
      return this.app.modules[module].models[model];
    }
    return null;
  }
}

module.exports = new CmsHelper();
