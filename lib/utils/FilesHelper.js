const fs = require('fs-extra');
const path = require('path');

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

  getAllDirNames(dirPath) {
    if (fs.existsSync(dirPath)) {
      return fs.readdirSync(dirPath).filter(f => {
        return fs.statSync(path.join(dirPath, f)).isDirectory();
      });
    }
    return null;
  }

  getAllFileNames(dirPath) {
    if (fs.existsSync(dirPath)) {
      return fs.readdirSync(dirPath).filter(f => {
        return fs.statSync(path.join(dirPath, f)).isFile();
      });
    }
    return null;
  }

  fileExists(dirPath) {
    return fs.existsSync(dirPath);
  }
}

// We will need only single instance
module.exports = new FilesHelper();
