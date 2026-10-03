// Local PeerJS signalling server for the multiplayer tests (port 9000).
// server.js rewrites config.js so the game uses it instead of the public PeerJS cloud.
const express = require('express');
const { ExpressPeerServer } = require('peer');
const app = express();
const server = app.listen(9000, '127.0.0.1', () => console.log('peer server on 9000')); // IPv4 only: IPv6 fails in some containers
app.use('/peer', ExpressPeerServer(server, { path: '/' }));
