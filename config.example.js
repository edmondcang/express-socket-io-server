module.exports = {
	isLiveMode: (process.env.mode == 'live'),
	dbInfo: {
	  host : (process.env.DB_HOST||'127.0.0.1'),
	  user : (process.env.DB||'{username}'),
	  database: (process.env.DB||'{db_name}'),
	  password : (process.env.DB_PASS||'{secret}'),
	},
	siteInfo: {
	  url: 'http://yourdomain.com',
	  urlDev: '',
  }
};
