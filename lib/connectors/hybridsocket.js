var util = require('util');
var EventEmitter = require('events').EventEmitter;
var protocol = require('pomelo-protocol');
var Package = protocol.Package;
var Message = protocol.Message;

var ST_INITED = 0;
var ST_WAIT_ACK = 1;
var ST_WORKING = 2;
var ST_CLOSED = 3;

/**
 * Socket class that wraps socket and websocket to provide unified interface for up level.
 */
var Socket = function(id, socket) {
  EventEmitter.call(this);
  this.id = id;
  this.socket = socket;
  this.remoteAddress = {
    ip: socket._socket.remoteAddress,
    port: socket._socket.remotePort
  };

  var self = this;

  socket.on('close', this.emit.bind(this, 'disconnect'));
  socket.on('error', this.emit.bind(this, 'error'));

  socket.on('message', function(msg) {
    if(msg) {
      msg = Package.decode(msg);
      handle(self, msg);
    }
  });

  this.state = ST_INITED;

  // TODO: any other events?
};

util.inherits(Socket, EventEmitter);

module.exports = Socket;

/**
 * Send raw byte data.
 *
 * @api private
 */
Socket.prototype.sendRaw = function(msg) {
  if(this.state !== ST_WORKING) {
    return;
  }

  this.socket.send(msg, {binary: true});
};

/**
 * Send byte data package to client.
 *
 * @param  {Buffer} msg byte data
 */
Socket.prototype.send = function(msg) {
  if(msg instanceof String) {
    msg = new Buffer(msg);
  } else if(!(msg instanceof Buffer)) {
    msg = new Buffer(JSON.stringify(msg));
  }

  this.sendRaw(Package.encode(Package.TYPE_DATA, msg));
};

Socket.prototype.sendBatch = function(msgs) {
  for(var i=0, l=msgs.length; i<l; i++) {
    this.send(msgs[i]);
  }
};

/**
 * Send message to client no matter whether handshake.
 *
 * @api private
 */
Socket.prototype.sendForce = function(msg) {
  if(this.state === ST_CLOSED) {
    return;
  }
  this.socket.send(msg, {binary: true});
};

/**
 * Response handshake request
 *
 * @api private
 */
Socket.prototype.handshakeResponse = function(resp) {
  if(this.state !== ST_INITED) {
    return;
  }
  this.socket.send(resp, {binary: true});
  this.state = ST_WAIT_ACK;
};

Socket.prototype.disconnect = function() {
  if(this.state === ST_CLOSED) {
    return;
  }

  this.state = ST_CLOSED;
  this.socket.close();
};

var handle = function(socket, msg) {
 var handler = handlers[msg.type];
 if(handler) {
  handler(socket, msg);
 }
};

var handleHandshake = function(socket, msg) {
  socket.emit('handshake', msg.body.toString('utf8'));
};

var handleHandshakeAck = function(socket, msg) {
  socket.state = ST_WORKING;
  socket.emit('heartbeat');
};

var handleHeartbeat = function(socket, msg) {
  socket.emit('heartbeat');
};

var handleData = function(socket, msg) {
  msg = Message.decode(msg.body);
  msg.route = protocol.strdecode(msg.route);
  msg.body = protocol.strdecode(msg.body);
  socket.emit('message', msg);
};

var handlers = {};
handlers[Package.TYPE_HANDSHAKE] = handleHandshake;
handlers[Package.TYPE_HANDSHAKE_ACK] = handleHandshakeAck;
handlers[Package.TYPE_HEARTBEAT] = handleHeartbeat;
handlers[Package.TYPE_DATA] = handleData;