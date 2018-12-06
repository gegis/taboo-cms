const EventEmitter = require('events');

class EventsEmitter extends EventEmitter {}

module.exports = new EventsEmitter();
