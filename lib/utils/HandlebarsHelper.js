const Handlebars = require('handlebars');

class HandlebarsHelper {
  constructor() {
    this.app = null;
  }

  setup(app) {
    this.app = app;
  }

  registerAllHelpers() {
    this.registerLink();
    this.registerifEquals();
    this.registerTranslate();
    this.registerLinkPrefix();
  }

  registerifEquals() {
    Handlebars.registerHelper('ifEquals', function(arg1, arg2, options) {
      return arg1 === arg2 ? options.fn(this) : options.inverse(this);
    });
  }

  registerLinkPrefix() {
    Handlebars.registerHelper('linkPrefix', function(options) {
      const { hash: { exclude = '' } = {} } = options;
      const { data: { root: { language = null } = {} } = {} } = options;
      let prefix = '';

      if (language && language !== exclude) {
        prefix = `/${language}`;
      }

      return prefix;
    });
  }

  registerLink() {
    const that = this;
    Handlebars.registerHelper('link', function(text, options) {
      const attrs = [];
      const { data: { root: { translations = {}, language = null } = {} } = {} } = options;
      const { hash: { variables = {}, exclude = '' } = {} } = options;
      let propValue;

      for (let prop in options.hash) {
        propValue = options.hash[prop];
        if (prop === 'href' && language && language !== exclude) {
          propValue = '/' + language + propValue;
        }
        if (['variables', 'noLanguagePrefix'].indexOf(prop) === -1) {
          attrs.push(Handlebars.escapeExpression(prop) + '="' + Handlebars.escapeExpression(propValue) + '"');
        }
      }

      return new Handlebars.SafeString(
        '<a ' +
          attrs.join(' ') +
          '>' +
          Handlebars.escapeExpression(that.translateText(text, translations, variables)) +
          '</a>'
      );
    });
  }

  registerTranslate() {
    const that = this;
    Handlebars.registerHelper('translate', function(text = '', options = {}) {
      const { data: { root: { translations = {} } = {} } = {} } = options;
      const { hash: { variables = {} } = {} } = options;
      return that.translateText(text, translations, variables);
    });
  }

  translateText(text, translations, variables) {
    let sRegExInput;
    let translation = text;
    if (text && translations && translations[text]) {
      translation = translations[text];
      if (variables) {
        for (let key in variables) {
          sRegExInput = new RegExp(`{${key}}`, 'g');
          translation = translation.replace(sRegExInput, variables[key]);
        }
      }
    }
    return translation;
  }
}

module.exports = new HandlebarsHelper();
