const Logger = require('./Logger');

class EjsHelper {
  constructor() {
    this.app = null;
    this.missingTranslations = {};
    this.getMissingTranslations = this.getMissingTranslations.bind(this);
    this._translateText = this._translateText.bind(this);
    this.getAllHelpers = this.getAllHelpers.bind(this);
  }

  setup(app) {
    this.app = app;
  }

  getMissingTranslations() {
    return this.missingTranslations;
  }

  getAllHelpers(data) {
    return {
      href: this.href,
      linkPrefix: this.linkPrefix,
      translate: this.translate,
      _data: data,
      _translateText: this._translateText,
    };
  }

  linkPrefix(options = {}) {
    const { exclude = [] } = options;
    const { language = null } = this._data;
    let prefix = '';

    if (language && [...exclude].indexOf(language) === -1) {
      prefix = `/${language}`;
    }

    return prefix;
  }

  href(href, options = {}) {
    let prefix = '';
    if (href && href.indexOf('/') === 0) {
      prefix = this.linkPrefix(options);
    }
    return `${prefix}${href}`;
  }

  translate(text, variables) {
    return this._translateText(text, this._data.translations, variables);
  }

  _translateText(text, translations = {}, variables = null) {
    const { config: { environment = null } = {} } = this.app;
    let sRegExInput;
    let translation = text;
    if (text && translations && translations[text]) {
      translation = translations[text];
    } else if (environment !== 'production') {
      if (!this.missingTranslations[translation]) {
        this.missingTranslations[translation] = translation;
      }
      Logger.warn(`Missing translation '${translation}'`);
    }
    if (variables) {
      for (let key in variables) {
        sRegExInput = new RegExp(`{${key}}`, 'g');
        translation = translation.replace(sRegExInput, variables[key]);
      }
    }
    return translation;
  }
}

module.exports = new EjsHelper();
