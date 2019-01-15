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
    this.registerTranslate();
  }

  registerLink() {
    const that = this;
    Handlebars.registerHelper('link', function(text, options) {
      const attrs = [];
      const { translations = {}, language } = options.data.root;
      const { variables = {} } = options.hash;
      let propValue;

      for (let prop in options.hash) {
        propValue = options.hash[prop];
        if (prop === 'href' && language) {
          propValue = '/' + language + propValue;
        }
        attrs.push(Handlebars.escapeExpression(prop) + '="' + Handlebars.escapeExpression(propValue) + '"');
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
    Handlebars.registerHelper('translate', function(text, options) {
      const { translations = {} } = options.data.root;
      const { variables = {} } = options.hash;
      return that.translateText(text, translations, variables);
    });
  }

  translateText(text, translations, variables) {
    let sRegExInput,
      translation = text;
    if (translations && text && translations[text]) {
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
