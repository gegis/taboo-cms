const fs = require('fs-extra');

class FilesHelper {
  constructor() {
    this.config = null;
  }

  setup(config) {
    this.config = config;
  }

  readFile(filePath, encoding = 'utf8') {
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, encoding, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  }
}

// We will need only single instance
module.exports = new FilesHelper();
