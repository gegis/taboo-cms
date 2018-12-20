const _ = require('lodash');
const Logger = require('./Logger');

class ApiHelper {
  constructor() {
    this.config = null;
  }

  setup(config) {
    this.config = config;
  }

  parseRequestParams(requestParams, paramsList) {
    const params = {};
    if (requestParams && _.isObject(requestParams)) {
      this.parseFilter(params, requestParams, paramsList);
      this.parseFields(params, requestParams, paramsList);
      this.parsePageParams(params, requestParams, paramsList);
      this.parseId(params, requestParams, paramsList);
    }

    return params;
  }

  parsePageParams(params, requestParams, paramsList) {
    if (
      [...paramsList].indexOf('page') !== -1 ||
      [...paramsList].indexOf('limit') !== -1 ||
      [...paramsList].indexOf('skip') !== -1
    ) {
      params.limit = this.config.api.defaultPageSize;
      params.skip = 0;
      if (requestParams.limit) {
        params.limit = parseInt(requestParams.limit);
      }
      if (requestParams.skip) {
        params.skip = parseInt(requestParams.skip);
      }
      if (requestParams.page) {
        params.skip = (parseInt(requestParams.page) - 1) * params.limit;
      }
    }
  }

  parseFields(params, requestParams, paramsList) {
    if ([...paramsList].indexOf('fields') !== -1) {
      params.fields = null;
      if (requestParams.fields) {
        params.fields = requestParams.fields;
      }
    }
  }

  parseId(params, requestParams, paramsList) {
    if ([...paramsList].indexOf('id') !== -1) {
      params.id = null;
      if (requestParams.id) {
        params.id = requestParams.id;
      }
    }
  }

  parseFilter(params, requestParams, paramsList) {
    if ([...paramsList].indexOf('filter') !== -1) {
      params.filter = {};
      if (requestParams.filter) {
        try {
          params.filter = JSON.parse(requestParams.filter);
        } catch (e) {
          Logger.error(e);
        }
      }
    }
  }
}

module.exports = new ApiHelper();
