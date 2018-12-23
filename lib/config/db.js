module.exports = {
  connections: {
    primary: {
      driver: 'mongodb',
      host: 'localhost',
      port: '27017',
      database: 'taboo-cms',
      user: '',
      password: '',
      options: {
        useNewUrlParser: true,
        useCreateIndex: true,
        useFindAndModify: false,
      },
    },
  },
};
