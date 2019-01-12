# Taboo CMS

## Notes
At the moment it is still in development phase.
Documentation is coming up.

##Documentation
It is using Koa framework. 
In your own app you have to install it as a dependency:
```
npm i taboo-cms
```

To start the server from your own app:
```
const { start, logger } = require('taboo-cms');

start().catch(error => {
  logger.error(error);
});
```

It will read config and all modules including their config, controllers, models and services from the 
following app structure:
```
app
    assets
        fonts
        img
        scripts
        styles
    db
        adapters
        migrations
    locales
    modules
        module1
            client
                compontents
                stores
                adminClientConfig.js
            controllers
            models
            services
            config.js
    policies
    templates
        error
        layouts
config
    environment
        development.js
        production.js
        staging.js
    local.js
logs
node_modules
public
scripts
tasks
index.js
package.json
package-lock.json
README.md
```

This web app boilerplate which includes basic modules, mongodb adapter,
build and watch tasks and also React admin side is coming up pretty soon.
