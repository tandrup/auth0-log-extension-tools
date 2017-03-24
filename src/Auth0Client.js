const jwt = require('jsonwebtoken');
const Promise = require('bluebird');
const request = require('superagent');
const memoizer = require('lru-memoizer');
const querystring = require('querystring');

const getAccessToken = function (options) {
  return new Promise(function(resolve, reject) {
    request
      .post('https://' + options.domain + '/oauth/token')
      .send({
        audience: 'https://' + options.domain + '/api/v2/',
        client_id: options.clientId,
        client_secret: options.clientSecret,
        grant_type: 'client_credentials'
      })
      .set('Accept', 'application/json')
      .end(function(err, res) {
        if (err) {
          return reject(err);
        }

        if (!res.ok || !res.body.access_token) {
          return reject(new Error('Unknown error from Management Api or no access token was provided: ' + (res.text || res.status)));
        }

        return resolve(res.body.access_token);
      });
  });
};

const getAccessTokenCached = function (options, storage) {
  return storage.getToken()
    .then(token => {
      if (token) {
        const decodedToken = jwt.decode(token);
        const expiresIn = new Date(0);

        console.log(token);
        console.log(decodedToken);
        expiresIn.setUTCSeconds((decodedToken && decodedToken.exp) || 0);
        const now = new Date().valueOf();

        if ((expiresIn.valueOf() - now) > 10000) {
          return token;
        }
      }

      return getAccessToken(options)
        .then(token => {
          storage.setToken(token);

          return token;
        });
    })
};

function Auth0Client(options, storage) {
  if (!options || !options.domain || !options.clientId || !options.clientSecret) {
    throw new Error('domain, clientId and clientSecret are required');
  }

  this.options = options;
  this.storage = storage;
}

Auth0Client.prototype.getLogs = function (params) {
  const self = this;
  return new Promise(function(resolve, reject) {
    getAccessTokenCached(self.options, self.storage)
      .then(function(token) {
        const query = querystring.stringify(params);
        
        request
          .get('https://' + self.options.domain + '/api/v2/logs?' + query)
          .set('Authorization', 'Bearer ' + token)
          .set('Content-Type', 'application/json')
          .end(function(err, res) {
            if (err) {
              return reject(err);
            }

            const limits = {
              limit: res.headers['x-ratelimit-limit'],
              remaining: res.headers['x-ratelimit-remaining'],
              reset: res.headers['x-ratelimit-reset']
            };

            return resolve({ logs: res.body, limits: limits });
          });
      });
  });
};

module.exports = Auth0Client;
