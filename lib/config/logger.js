module.exports = {
  name: 'taboo-cms',
  streams: [
    {
      level: 'info',
      stream: process.stdout,
    },
    {
      level: 'info',
      path: './logs/info.log',
      type: 'rotating-file',
      period: '1d',
      count: 5,
    },
    {
      level: 'error',
      path: './logs/error.log',
      type: 'rotating-file',
      period: '5d',
      count: 5,
    },
  ]
};
