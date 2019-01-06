const _ = require('lodash');

class DbAdapter {
  constructor(config) {
    this.config = config;
    if (!_.isFunction(this.connect)) {
      throw new TypeError('Must implement: connect(options, next)');
    }
    if (!_.isFunction(this.setupModel)) {
      throw new TypeError('Must implement: setupModel(module, model, modelName)');
    }
  }
}

module.exports = DbAdapter;
