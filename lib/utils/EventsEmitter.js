const EventEmitter = require('events');

class EventsEmitter extends EventEmitter {
  constructor() {
    super();
    this.app = null;
  }

  setup(app) {
    this.app = app;
    this.setMaxListeners(this.app.config.server.eventsMaxListeners);
  }
}

module.exports = new EventsEmitter();
