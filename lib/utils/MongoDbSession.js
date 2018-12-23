const mongoose = require('mongoose');
const defaultExpire = 86400;

const sessionSchema = {
  key: String,
  value: Object,
  updatedAt: {
    default: new Date(),
    expires: defaultExpire,
    type: Date,
  },
};

class MongoDbSession {
  constructor({ name = 'Session', expires = defaultExpire }) {
    sessionSchema.updatedAt.expires = expires;
    this.schema = new mongoose.Schema(sessionSchema);
    this.model = mongoose.model(name, this.schema);
  }

  async destroy(key) {
    return this.model.deleteOne({ key });
  }

  async get(key, maxAge, options) {
    const item = await this.model.findOne({ key });
    if (item) {
      return item.value;
    }
    return null;
  }

  async set(key, value, maxAge, options) {
    const item = { value };
    if (options.rolling) {
      item.updatedAt = new Date();
    }
    const result = await this.model.findOneAndUpdate({ key }, item, { upsert: true, safe: true });
    return (result) ? result.value : null;
  }
}

module.exports = MongoDbSession;
