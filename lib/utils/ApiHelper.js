const _ = require('lodash');
const Logger = require('./Logger');

class ApiHelper {
  constructor() {
    this.config = null;
  }

  setup(config) {
    this.config = config;
  }

  parseQueryParams(request) {
    const { defaultPageSize } = this.config.api;
    const { query } = request;
    const params = {
      filter: {},
      fields: null,
      options: {
        limit: defaultPageSize,
        skip: 0
      }
    };

    if (query && _.isObject(query)) {
      if (query.filter) {
        try {
          params.filter = JSON.parse(query.filter);
        } catch (e) {
          Logger.error(e);
        }
      }
      if (query.fields) {
        params.fields = query.fields;
      }
      if (query.limit) {
        params.options.limit = parseInt(query.limit);
      }
      if (query.skip) {
        params.options.skip = parseInt(query.skip);
      }
      if (query.page) {
        params.options.skip = (parseInt(query.page) - 1) * params.options.limit;
      }
    }

    return params;
  }
}

module.exports = new ApiHelper();
