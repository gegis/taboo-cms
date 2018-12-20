const mongoose = require('mongoose');
const _ = require('lodash');
const Logger = require('./Logger');
const DbAdapter = require('./DbAdapter');

class MongoDbAdapter extends DbAdapter {
  constructor(config) {
    super(config);
  }

  connect(options, next) {
    let connectionString = 'mongodb://';
    let db = '';

    if (this.config.user) {
      connectionString += this.config.user;
    }
    if (this.config.password) {
      connectionString += `:${this.config.password}`;
    }
    if (this.config.user) {
      connectionString += '@';
    }
    connectionString += `${this.config.host}:${this.config.port}/${this.config.database}`;

    mongoose.connect(
      connectionString,
      options
    );

    db = mongoose.connection;

    db.on('error', err => {
      Logger.error(err);
    });

    db.once('open', () => {
      Logger.info(
        `Successfully connected to MongoDB at: ${this.config.host}:${this.config.port}/${this.config.database}`
      );
      if (next && _.isFunction(next)) {
        next(null, db);
      }
    });
  }

  setupModel(module, model, modelName) {
    if (!model.schema) {
      throw new Error('Model must have "schema" specified');
    }
    if (!model.connection) {
      throw new Error('Model must have "connection" key name value');
    }
    const schema = new mongoose.Schema(model.schema);
    if (!module.models) {
      module.models = {};
    }
    if (model.hooks && _.isArray(model.hooks)) {
      this.setupHooks(schema, model.hooks);
    }
    module.models[modelName] = mongoose.model(modelName, schema);
  }

  setupHooks(schema, hooks) {
    [...hooks].map((hook) => {
      if (hook.options) {
        schema[hook.type](hook.hook, hook.options, hook.handler);
      } else {
        schema[hook.type](hook.hook, hook.handler);
      }

    });
  }
}

module.exports = MongoDbAdapter;
