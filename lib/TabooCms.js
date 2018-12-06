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
    };
    this.setMaxListeners(this.app.config.server.eventsMaxListeners);
  }

  start(next) {
    //TODO best linting practices

    if (this.app.running) {
      throw new Error('TabooCms is already running');
    } else {
      this.app.running = true;
      this.setupUtils();
      this.setupServerKeys();
      this.setupMiddleware();
      this.setupBackendModules();
      // this.setupRoutes();
      this.setupStatic();
      this.setupOnServerError();
      // this.app.server.listen(3000);
      // next(null, this.app);
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

  setupMiddleware() {
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

  setupBackendModules() {
    const modules = readdirSync(
      path.join(this.app.cwd, this.app.config.server.backendDir)
    ).filter(f => {
      return statSync(
        path.join(this.app.cwd, this.app.config.server.backendDir, f)
      ).isDirectory();
    });
    console.log(modules);

    modules.map((module) => {
      let moduleConfig;
      let modulePath = path.join(
        this.app.cwd,
        this.app.config.server.backendDir,
        module,
        this.app.config.server.moduleConfigFile
      );
      try {
        moduleConfig = require(modulePath);
        if (moduleConfig.routes) {
          this.setupRoutes(moduleConfig);
        }
      } catch(e) {
        Logger.error(e);
      }

      console.log(moduleConfig);
    });

    this.app.server.use(this.app.router.routes());
    this.app.server.use(this.app.router.allowedMethods());
  }

  setupRoutes(moduleConfig) {
    // TODO implement route.policies!!!
    if (moduleConfig.routes) {
      moduleConfig.routes.map(route => {
        this.app.router[route.method.toLowerCase()](route.path, route.handler.bind(moduleConfig.controller));
      });
    }
  }


  setupController(controllerName) {
    let Controller;
    if (!Object.prototype.hasOwnProperty.call(this.controllers, controllerName)) {
      try {
        // eslint-disable-next-line global-require, import/no-dynamic-require
        Controller = require(path.resolve(
          this.config.server.controllersPath,
          controllerName
        ));
        this.controllers[controllerName] = new Controller(this.config);
      } catch (e) {
        Logger.error(e);
      }
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

  setupOnServerError() {
    this.app.server.on('error', (err, ctx) => {
      Logger.error('Server error', err, ctx);
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
    this.app.use(async ctx => {
      let response = null;
      if (ctx.err) {
        this.sendErrorResponse(ctx, ctx.err);
      } else if (ctx.data) {
        response = await this.getServerResponse(ctx).catch(e =>
          this.sendErrorResponse(ctx, e)
        );
      }
      return response;
    });
  }

  async getServerResponse(ctx) {
    const page = await this.getPage(ctx);
    const layout = await this.getLayout(ctx);
    return this.composeResponse(layout, page, ctx.data);
  }

  async getPage(ctx) {
    const view = ctx.data._view || this.config.server.defaultView;
    const pagePath = path.resolve(this.config.server.viewsPath, view);
    return FilesHelper.readFile(pagePath);
  }

  async getLayout(ctx) {
    const layout = ctx.data._layout || this.config.server.defaultLayout;
    const layoutPath = path.resolve(this.config.server.layoutsPath, layout);
    return FilesHelper.readFile(layoutPath);
  }

  sendErrorResponse(ctx, err) {
    Logger.error(err);
    ctx.status = 500;
    ctx.body = 'Server Error';
  }

  composeResponse(layoutTpl, pageTpl, data) {
    Object.assign(data, { body: Mustache.render(pageTpl, data) });
    Object.assign(data, { appConfig: this.getClientConfig() });
    return Mustache.render(
      layoutTpl,
      Object.assign(
        {
          version: this.config.version,
          title: this.config.server.defaultPageTitle,
          env: this.config.environment,
          mapsApiKey: this.config.server.mapsApiKey,
        },
        data
      )
    );
  }

  getClientConfig() {
    const config = {
      sockets: {
        port: this.config.sockets.port,
      },
      server: {
        port: this.config.server.port,
      },
    };
    return JSON.stringify(config);
  }
}

module.exports = new TabooCms();
