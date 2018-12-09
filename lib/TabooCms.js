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
    // TODO merge with app config!!!
    // TODO find config module
    // TODO investigate jwt
    //parse app configs
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
      throw new Error('TabooCms is already running');
    } else {
      this.app.running = true;
      this.setupUtils();
      this.setupOnServerError();
      this.setupServerKeys();
      this.setupMiddleware();
      this.setupStatic();
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

  setupServerKeys() {
    this.app.server.keys = new KeyGrip(
      this.app.config.server.secretKeys,
      'sha256'
    );
  }

  setupOnServerError() {
    this.app.server.on('error', (err, ctx) => {
      Logger.error('Server error:');
      // Logger.error(ctx); // TODO Enable this for prod for more info debug
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
      return next();
    });

    // TODO the below to implement only for dev
    this.app.server.use(async (ctx, next) => {
      await next();
      const rt = ctx.response.get('X-Response-Time');
      console.log(`${ctx.method} ${ctx.url} - ${rt}`);
    });

    // x-response-time
    this.app.server.use(async (ctx, next) => {
      const start = Date.now();
      await next();
      const ms = Date.now() - start;
      ctx.set('X-Response-Time', `${ms}ms`);
    });
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

  // setupController(controllerName) {
  //   let Controller;
  //   if (!Object.prototype.hasOwnProperty.call(this.controllers, controllerName)) {
  //     try {
  //       // eslint-disable-neconsole.log(this.app.router.allowedMethods().toString());xt-line global-require, import/no-dynamic-require
  //       Controller = require(path.resolve(
  //         this.config.server.controllersPath,
  //         controllerName
  //       ));
  //       this.controllers[controllerName] = new Controller(this.config);
  //     } catch (e) {
  //       Logger.error(e);
  //     }
  //   }
  // }

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

  // setupModules() {
  //     Logger.setup(this.config);
  //     FilesHelper.setup(this.config);
  //     this.socketsServer = new SocketsServer(this.config);
  // }

  // setupRoutes() {
  //     const routes = Object.entries(this.config.routes);
  //     let method;
  //     let route;
  //     let controller;
  //     let action;
  //     if (routes) {
  //         routes.map(routeArray => {
  //             [method, route] = routeArray[0].split(' ');
  //             [controller, action] = routeArray[1].split('.');
  //             this.setupController(controller);
  //             if (this.controllers[controller]) {
  //                 this.app.use(
  //                     koaRoute[method](route, this.controllers[controller][action].bind(this.controllers[controller]))
  //                 );
  //             }
  //             return null;
  //         });
  //     }
  // }

  //
  // setupRoutes() {
  //
  //     // response
  //     this.app.server.use(async ctx => {
  //         ctx.cookies.set('name', 'tobi', { signed: true });
  //
  //         ctx.body = 'Hello World';
  //     });
  //
  // }


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
      return FilesHelper.readFile(layoutPath);
    } catch (e) {
      ctx.status = 500;
      ctx.body = e.message;
    }
  }

  composeResponse(layoutTpl, pageTpl, data) {
    const { config } = this.app;
    Object.assign(data, { body: Mustache.render(pageTpl, data) });
    Object.assign(data, { appConfig: this.getClientConfig() });
    return Mustache.render(
      layoutTpl,
      Object.assign(
        {
          version: config.version,
          title: config.server.defaultPageTitle,
          env: config.environment,
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
