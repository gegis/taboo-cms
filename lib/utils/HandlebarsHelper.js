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
      let propValue;

      for (let prop in options.hash) {
        propValue = options.hash[prop];
        if (prop === 'href' && this.language) {
          propValue = '/' + this.language + propValue;
        }
        attrs.push(Handlebars.escapeExpression(prop) + '="' + Handlebars.escapeExpression(propValue) + '"');
      }

      return new Handlebars.SafeString(
        '<a ' +
          attrs.join(' ') +
          '>' +
          Handlebars.escapeExpression(that.translateText(text, this.translations)) +
          '</a>'
      );
    });
  }

  registerTranslate() {
    const that = this;
    Handlebars.registerHelper('translate', function(text) {
      return that.translateText(text, this.translations);
    });
  }

  translateText(text, translations) {
    if (translations && text && translations[text]) {
      return translations[text];
    }
    return text;
  }
}

module.exports = new HandlebarsHelper();
