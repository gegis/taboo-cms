const { EventEmitter } = require('events');
const Koa = require('koa');
const Router = require('koa-router');
const KeyGrip = require('keygrip');
const { readdirSync, statSync } = require('fs-extra');
const path = require('path');
const _ = require('lodash');
const serve = require('koa-static');
const Mustache = require('mustache');
const config = require('./config');
const Logger = require('./utils/Logger');
const FilesHelper = require('./utils/FilesHelper');

class TabooCms extends EventEmitter {
  constructor() {
    super();
    // TODO investigate jwt
    this.app = {
      running: false,
      cwd: process.cwd(),
      config: config,
      server: new Koa(),
      router: new Router(),
      modules: {}
    };
    this.setMaxListeners(this.app.config.server.eventsMaxListeners);
  }

  start(next) {
    if (this.app.running) {
      Logger.error('TabooCms is already running');
    } else {
      this.app.running = true;
      this.setupUtils();
      this.setupOnServerError();
      this.setupServerSecretKeys();
      this.setupStatic();
      this.setupMiddleware();
      this.setupAppModules();
      this.setupServerResponse();
      this.startServer(next);
    }
  }

  getConfig() {
    return this.app.config;
  }

  setupUtils() {
    Logger.setup(this.app.config);
  }

  setupServerSecretKeys() {
    this.app.server.keys = new KeyGrip(
      this.app.config.server.secretKeys,
      'sha256'
    );
  }

  setupOnServerError() {
    this.app.server.on('error', (err, ctx) => {
      Logger.error('Server error:');
      if (['debug', 'production'].indexOf(this.app.config.environment) !== -1) {
        Logger.error(ctx);
      }
      Logger.error(err);
    });
    this.app.server.use(async (ctx, next) => {
      let errorResponse;
      try {
        await next();
      } catch (err) {
        ctx.status = err.status || 500;
        errorResponse = await this.getServerErrorResponse(err);
        ctx.body = errorResponse;
        ctx.app.emit('error', err, ctx);
      }
    });
  }

  setupMiddleware() {
    // Setup taboo object on ctx object
    this.app.server.use(async (ctx, next) => {
      ctx.taboo = {};
      await next();
    });

    if (['debug', 'develop'].indexOf(this.app.config.environment) !== -1) {
      this.app.server.use(async (ctx, next) => {
        const start = Date.now();
        await next();
        const ms = Date.now() - start;
        Logger.info(`${ctx.method} ${ctx.url} - ${ms} ms`);
      });
    }
  }

  setupAppModules() {
    const modules = readdirSync(
      path.join(this.app.cwd, this.app.config.server.appDir)
    ).filter(f => {
      return statSync(
        path.join(this.app.cwd, this.app.config.server.appDir, f)
      ).isDirectory();
    });

    modules.map((module) => {
      let moduleConfig;
      let modulePath = path.join(
        this.app.cwd,
        this.app.config.server.appDir,
        module,
      );
      let moduleConfigPath = path.join(
        modulePath,
        this.app.config.server.modules.configFile
      );
      try {
        moduleConfig = require(moduleConfigPath);
        this.app.modules[module] = moduleConfig;
        if (moduleConfig.routes) {
          this.setupRoutes(moduleConfig, modulePath);
        }
      } catch(e) {
        Logger.error(e);
      }
    });

    this.app.server.use(this.app.router.routes());
    this.app.server.use(this.app.router.allowedMethods());
  }

  setupRoutes(moduleConfig, modulePath) {
    // TODO implement route.policies!!!
    if (moduleConfig && moduleConfig.routes) {
      moduleConfig.routes.map(route => {
        this.app.router[route.method.toLowerCase()](route.path, async (ctx, next) => {
          ctx.taboo.module = {
            route: route,
            path: modulePath,
          };
          return await route.handler.call(moduleConfig.controller, ctx, next);
        });
      });
    }
  }

  setupStatic() {
    this.app.server.use(serve(this.app.config.server.publicDir));
  }

  startServer(next) {
    this.app.server.listen(this.app.config.server.port, () => {
      Logger.info(`Server is listening on port ${this.app.config.server.port}`);
      // TODO implement sockets server
      // this.socketsServer.start(this.app);
      this.emit('server-started', this.app);
      if (_.isFunction(next)) {
        next(null, this.app);
      }
    });
  }

  setupServerResponse() {
    this.app.server.use(async (ctx, next) => {
      let response;
      console.log('setupServerResponse !!!!!');
      if (ctx.err) {
        ctx.throw(500, ctx.err);
      } else if (ctx.data) {
        response = await this.getServerResponse(ctx);
        ctx.body = response;
      } else {
        await next();
      }
    });
  }

  async getServerResponse(ctx) {
    const page = await this.getPage(ctx);
    const layout = await this.getLayout(ctx);
    return this.composeResponse(layout, page, ctx.data);
  }

  async getPage(ctx) {
    const { module } = ctx.taboo;
    const { server } = this.app.config;
    let pagePath, view; // TODO implement custom view name!!!!

    if (module && module.route && module.route.handler && module.route.handler.name && module.path) {
      view = `${module.route.handler.name}.${server.modules.viewsExtension}`;
      if (ctx.data && ctx.data._view) {
        view = ctx.data._view;
      }
      try {
        pagePath = path.join(
          module.path,
          server.modules.viewsDir,
          view
        );
        return await FilesHelper.readFile(pagePath);
      } catch (e) {
        return Logger.error(e);
      }
    }
  }

  async getLayout(ctx) {
    const { server } = this.app.config;
    const layout = ctx.data._layout || server.views.defaultLayout;
    const layoutPath = path.join(server.views.layoutsDir, layout);
    try {
      return await FilesHelper.readFile(layoutPath);
    } catch (e) {
      ctx.throw(500, e);
    }
  }

  async getServerErrorResponse(err) {
    const page = await this.getErrorPage(err);
    const layout = await this.getErrorLayout(err);
    return this.composeResponse(layout, page, {
      error: err.message
    });
  }

  async getErrorPage(err) {
    const { views } = this.app.config.server;
    let pagePath, fileContents;
    try {
      pagePath = path.join(
        this.app.cwd,
        views.errorsDir,
        `${err.status}.html`
      );
      return await FilesHelper.readFile(pagePath);
    } catch (e) {
      Logger.error(e);
      pagePath = path.join(
        this.app.cwd,
        views.errorsDir,
        views.defaultErrorView
      );
      return FilesHelper.readFile(pagePath);
    }
  }

  async getErrorLayout(err, ctx) {
    const { views } = this.app.config.server;
    const layoutPath = path.join(this.app.cwd, views.layoutsDir, views.defaultErrorLayout);
    try {
      return await FilesHelper.readFile(layoutPath);
    } catch (e) {
      ctx.status = 500;
      ctx.body = e.message;
    }
  }

  composeResponse(layoutTpl, pageTpl, data) {
    const { config } = this.app;
    Object.assign(data, { _body: Mustache.render(pageTpl, data) });
    Object.assign(data, { _appConfig: this.getClientConfig() });
    return Mustache.render(
      layoutTpl,
      Object.assign(
        {
          _version: config.version,
          _title: config.server.views.defaultPageTitle,
          _env: config.environment,
        },
        data
      )
    );
  }

  getClientConfig() {
    const { config } = this.app;
    const clientConfig = {
      // sockets: {
      //   port: config.sockets.port,
      // },
      server: {
        port: config.server.port,
      },
    };
    return JSON.stringify(clientConfig);
  }
}

module.exports = new TabooCms();
