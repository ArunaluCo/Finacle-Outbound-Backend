'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const config = require('./src/config');
const { handle } = require('./src/router');

function createServer() {
  const handler = (req, res) => {
    handle(req, res).catch((error) => {
      console.error('Unhandled error:', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ code: '500', message: 'Mock internal error' }));
    });
  };
  // Railway terminates TLS itself; the key/cert pair is for running on the lab LAN like APIM
  if (config.tlsKeyFile && config.tlsCertFile) {
    return https.createServer(
      { key: fs.readFileSync(config.tlsKeyFile), cert: fs.readFileSync(config.tlsCertFile) },
      handler
    );
  }
  return http.createServer(handler);
}

if (require.main === module) {
  createServer().listen(config.port, () => {
    const scheme = config.tlsKeyFile ? 'https' : 'http';
    console.log(`VAM mock listening on ${scheme} port ${config.port}`);
    if (config.usingDefaultCredentials) {
      console.warn('WARNING: demo client credentials in use - set MOCK_CLIENT_ID and MOCK_CLIENT_SECRET');
    }
  });
}

module.exports = { createServer };
