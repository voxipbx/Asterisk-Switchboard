var app = require('http').createServer(handler),
  io = require('socket.io').listen(app),
  fs = require('fs'),
  mysql = require('mysql'),
  connectionsArray = [],
  bridge = {},
  devices = [],
  connection,
  net = require('net'),
  db_config = {
    host: 'localhost',
    user: 'user',
    password: 'pass',
    database: 'VoxIPBX',
    port: 3306
  },
  POLLING_INTERVAL = 3000
  ;

var telnetsockets = [];

/*
 * Cleans the input of carriage return, newline
 */
function cleanInput(data) {
    return data.toString().replace(/(\r\n|\n|\r)/gm,"");
}

/*
 * Method executed when data is received from a socket
 */
function receiveData(socket, data) {
    var cleanData = cleanInput(data);
    if(cleanData === "quit") {
        socket.end('Goodbye!\n');
    }else if(cleanData === "client reload") {
        connectionsArray.forEach(function(tmpSocket) {
            setTimeout(function() {
                tmpSocket.volatile.emit('Reload');
            socket.write(tmpSocket.conn.remoteAddress + ' Reloaded\n');
            }, Math.floor(Math.random() * (100) + 1 ));
        });
    }else if(cleanData === "client list") {
        connectionsArray.forEach(function(tmpSocket) {
            socket.write(tmpSocket.conn.remoteAddress + '\n');
        });
    }else if(cleanData === "show config") {
        socket.write(app._connectionKey + '\n');
    }else if(cleanData === "help") {
        socket.write("COMMAND\tRESULT\n\n");
        socket.write("client list\tlist all connected clients\n");
        socket.write("show config\tshow ip:port config\n");
    }
    else {
        for(var i = 0; i<telnetsockets.length; i++) {
            if (telnetsockets[i] !== socket) {
                telnetsockets[i].write(data);
            }
        }
    }
}

/*
 * Method executed when a socket ends
 */
function closeSocket(socket) {
    var i = telnetsockets.indexOf(socket);
    if (i != -1) {
        telnetsockets.splice(i, 1);
    }
}

/*
 * Callback method executed when a new TCP socket is opened.
 */
function newSocket(socket) {
    telnetsockets.push(socket);
    socket.write('Welcome to the Telnet server!\n');
    socket.on('data', function(data) {
        receiveData(socket, data);
    })
    socket.on('end', function() {
        closeSocket(socket);
    })
    socket.on('error', function(ex) {
        console.log("handled error");
        console.log(ex);
    });
}

// Create a new server and provide a callback for when a connection occurs
var server = net.createServer(newSocket);

// Listen on port 8888
server.listen(8888);


function handleDisconnect() {
  connection = mysql.createConnection(db_config); // Recreate the connection, since
                                                  // the old one cannot be reused.

  connection.connect(function(err) {              // The server is either down
    if(err) {                                     // or restarting (takes a while sometimes).
      debug('error when connecting to db:', err);
      setTimeout(handleDisconnect, 2000); // We introduce a delay before attempting to reconnect,
    }                                     // to avoid a hot loop, and to allow our node script to
  });                                     // process asynchronous requests in the meantime.
                                          // If you're also serving http, display a 503 error.
  connection.on('error', function(err) {
    debug('db error', err);
    if(err.code === 'PROTOCOL_CONNECTION_LOST') { // Connection to the MySQL server is usually
      handleDisconnect();                         // lost due to either server restart, or a
    } else {                                      // connnection idle timeout (the wait_timeout
      throw err;                                  // server variable configures this)
    }
  });
}

handleDisconnect();

var util = require('util');

var AMI = require('yana');

var ami = new AMI({
  port: 5038,
  host: 'localhost',
  login: 'admin',
  password: 'admin',
  events: true,
  reconnect: true
});

function print_res (res) {
  util.log('response to action: ' + util.inspect(res));
}

ami.connect(function () {
  ami.send({Action: 'Command', Command: 'core show uptime'}, print_res);
  util.log('connected to AMI version ' + ami.version);
});

ami.on('error', function (e) {
  util.log('Fatal error: ' + e);
  process.exit(255);
});

process.on('SIGINT', function () {
  util.log('SIGINT received, stopping');
  ami.disconnect();
  process.exit(0);
});

app.listen(8081);

io.sockets.on( 'connection', function ( socket ) {

    debug('Number of connections:' + connectionsArray.length);

    socket.on('client_data', function(data){
    var clientinput = data.letter.split(".");
            debug('Letter:' + clientinput[0]);
            debug('Action:' + clientinput[1]);
            debug('Channel:' + clientinput[2]);
            debug('Operator:' + clientinput[3]);
            debug('Extra:' + clientinput[4]);
            debug('Extra1:' + clientinput[5]);
        if (clientinput[0] == 32){ // Spatie ingedrukt
            if (clientinput[1]=='Hangup') {
                ami.send({Action: 'Hangup',
                    Channel: clientinput[2]
                }, function (res) {
                    debug((res));
                });
            } else if(clientinput[1]=='PickQueueCall'){
                ami.send({Action: 'Status',
                    Channel: clientinput[2]
                }, function (res) {
                    debug((res));
                    if (res.BridgeID=='' && (res.Context == 'queue' || res.Exten == clientinput[3])){
                        ami.send({Action: 'Redirect',
                            Channel: clientinput[2],
                            Context: 'loggedin',
                            Priority: 1,
                            Exten: 'op01_' + clientinput[3]
                        }, function (res) {
                            debug((res));
                        });
                    }
                });
            } else if (clientinput[1]=='Transfer') {
                ami.send({Action: 'Bridge',
                    Channel1: clientinput[2],
                    Channel2: clientinput[3],
                    Tone: 'Channel2'
                }, function (res) {
                    debug((res));
                });
            } else if (clientinput[1]=='CallOnHold') {
                ami.send({Action: 'Redirect',
                    Channel: clientinput[2],
                    Context: 'loggedin',
                    Priority: 1,
                    Exten: 'op01_hold_' + clientinput[3]
                }, function (res) {
                    debug((res));
                });
            }
        }
        else if (clientinput[0] == 13){ // Return
        if (clientinput[1]=='AttendedTransfer') {
            debug('AttendedTransfer:' + clientinput[3]);
            ami.send({Action: 'Redirect',
                Channel: clientinput[2],
                Context: 'loggedin',
                Priority: 1,
                Exten: 'op01_tra_' + clientinput[3],
                ExtraPriority: 1,
                ExtraChannel: clientinput[4],
                ExtraContext: 'users',
                ExtraExten: clientinput[5]
            }, function (res) {
                debug((res));
            });
        }else if (clientinput[1]=='Dial') {
            ami.send({Action: 'Originate',
                Channel: 'SIP/' + clientinput[3],
                Context: 'users',
                //Variable: 'SIPADDHEADER01=Alert-Info: \;info=alert-autoanswer|Call-Info: \;answer-after=0',
                Variable: 'SIPADDHEADER01=Call-Info: \;answer-after=0',
                //Variable: 'SIPADDHEADER01=Alert-Info: \;info=alert-autoanswer',
                //Variable: 'SIPADDHEADER03=Alert-Info: \;ALERT_INFO=RA',
                Priority: 1,
                CallerIDNum: clientinput[2],
                Exten: clientinput[2]
                //Exten: clientinput[2]
            }, function (res) {
                debug((res));
            });
        } else if (clientinput[1]=='Transfer') {
            ami.send({Action: 'Bridge',
                Channel1: clientinput[2],
                Channel2: clientinput[3],
                Tone: 'Channel2'
            }, function (res) {
                debug((res));
            });
        }
        }
        else {
        if (clientinput[1]=='Hangup') {
            ami.send({Action: 'Hangup',
                Channel: clientinput[2]
            }, function (res) {
                debug((res));
            });
        } else if (clientinput[1]=='PickupHold') {
            ami.send({Action: 'Redirect',
                Channel: clientinput[2],
                Context: 'loggedin',
                Priority: 1,
                Exten: 'op01_' + clientinput[3]
            }, function (res) {
                debug((res));
            });
        } else if (clientinput[1]=='Transfer') {
            ami.send({Action: 'Bridge',
                Channel1: clientinput[2],
                Channel2: clientinput[3],
                Tone: 'Channel2'
            }, function (res) {
                debug((res));
            });
        } else if (clientinput[1]=='Pause') {
            ami.send({Action: 'Command',
                Command: 'queue pause member SIP/' + clientinput[2]
            });
        } else if (clientinput[1]=='UnPause') {
            ami.send({Action: 'Command',
                Command: 'queue unpause member SIP/' + clientinput[2]
            });
        }
            //process.stdout.write( bridge + "\n");
        //process.stdout.write(data.letter + "\n");
    }
    });
    socket.on('disconnect', function () {
        var socketIndex = connectionsArray.indexOf( socket );
        debug('socket = ' + socketIndex + ' disconnected');
        if (socketIndex >= 0) {
            connectionsArray.splice( socketIndex, 1 );
        }
    });

    debug( 'A new socket is connected!' );
    connectionsArray.push( socket );

  var query = connection.query('SELECT voxipbx.extensions.extension AS Exten, voxipbx.users.firstname, voxipbx.users.lastName, voxipbx.sipaccount as Sip, voxipbx.extensions.id AS Status ORDER BY firstName');
    users = []; // this array will contain the result of our db query
    query
    .on('error', function(err) {
    // Handle error, and 'end' event will be emitted after this as well
    debug(err);
    updateSockets(err);
    })
    .on('result', function(user) {
    // it fills our array looping on each user row inside the db
    users.push(user);
    })
    .on('end', function() {
    if (connectionsArray.length) {
        updateSockets1({
        extensions: users
    });
setTimeout(function() {
    ami.send({
        Action: 'ExtensionStateList'
    }, update_ExtensionStatus);
}, 1800);
setTimeout(function() {
    ami.send({
        Action: 'DeviceStateList'
    });
}, 800);

setTimeout(function() {
    eventBridges({
        notification: bridge
    });
}, 1800);
    } else {
        debug('The server timer was stopped because there are no more socket connections on the app')
    }
    });

});




var net = require('net');


function debug(log, arg) {
  var d = new Date()
  var Datum
  Datum = d.getFullYear() + "-" + ('0' + (d.getMonth()+1)).slice(-2) + "-" +('0' + d.getDate()).slice(-2) + " " + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);


  fs.appendFile('/var/log/switchboard.log', '[' + Datum + ']\t' + util.inspect(log).replace(/\n/g, "\n\t\t\t") + '\n', function (err) {
    if (err) throw err;
  });
  fs.appendFile('/var/log/switchboard.log', '\t\t\t' + util.inspect(arg).replace(/\n/g, "\n\t\t\t") + '\n', function (err) {
    if (err) throw err;
  });

}



// on server started we can load our client.html page
function handler(req, res) {
    debug(req.url.substr(1,5));
    if (req.url.substr(1,5)!="voxip"){
        fs.readFile(__dirname + '/client.html', function(err, data) {
            if (err) {
            debug(err);
            res.writeHead(500);
            return res.end('Error loading client.html');
            }
            res.writeHead(200);
            res.end(data);
        });
    } else {
        fs.readFile(__dirname + req.url, function(err, data) {
            if (err) {
            debug(err);
            res.writeHead(500);
            return res.end('Error loading client.html');
            }
            res.writeHead(200);
            res.end(data);
        });
    }
}


ami.on('FullyBooted', function () {
    ami.on('error', function(err){
        debug("ERROR: ", err);
    });

    ami.on('ready', function(){
        // connected && authenticated
    });



    ami.on('event', function(data){
        debug(data.Event, data);
    });
    //ami.on('DialBegin', function(data){
        //debug('DialBegin', data);
        //eventDialBegin({
            //notification: data
        //});
    //});
    ami.on('DialEnd', function(data){
        eventDialEnd({
            notification: data
        });
    });

    ami.on('BridgeMerge', function(data){
        debug("BridgeMerge", data);
    });
    ami.on('NewCallerid', function(data){
        debug("NewCallerid", data);
    });
    //ami.on('Hangup', function(data){
        //eventHangup({
            //notification: data
        //});
    //});
    //ami.on('Newchannel', function(data){
        //debug('eventNewchannel', data);
    //});

    // Bridge event
    ami.on('BridgeLeave', function(data){
        if (typeof bridge[data.BridgeUniqueid] !== 'undefined') {
            if (Object.keys(bridge[data.BridgeUniqueid]).indexOf('_1') != -1){
                if (bridge[data.BridgeUniqueid]._1.Uniqueid == data.Uniqueid){
                    delete bridge[data.BridgeUniqueid]._1;
                }else if (bridge[data.BridgeUniqueid]._2.Uniqueid == data.Uniqueid){
                    delete bridge[data.BridgeUniqueid]._2;
                }
            }
            //bridge[data.BridgeUniqueid][data.Uniqueid].remove();
            //bridge.splice(data.BridgeUniqueid.indexOf(data.Uniqueid),1);
            //for( i=bridge[data.BridgeUniqueid].length-1; i>=0; i--) {
                //debug('eventBridgeLeave', bridge[i].ID);
                //if( bridge[i].ID == data.Uniqueid) bridge.splice(i,1);
            //}
            eventBridges({
                notification: bridge
            });
            debug('eventBridgeLeave', data);
            debug('eventBridgeLeave', bridge);
        }else{
            debug('eventBridgeLeave, No Bridge available');
        }
    });

    ami.on('UserEvent', function(data){
        debug('eventUserEvent', data.UserEvent);
    connectionsArray.forEach(function(tmpSocket) {
        var Events = data.UserEvent.split(";");
            result = {}
        Events.forEach(function(Event) {
            var res = Event.split(":");
            if (res[0] == 'exten'){
                result.exten = res[1];
            }else if(res[0] == 'action'){
                result.action = res[1];
            }else if(res[0] == 'arg'){
                result.arg = res[1];
            }else if(res[0] == 'sip'){
                result.sip = res[1];
            }
    });
        tmpSocket.volatile.emit("eventUserEvent", result);
    });
    });
    // Bridge event
    ami.on('BridgeEnter', function(data){
        BridgeNum = '_' +data.BridgeNumChannels;
        bridge[data.BridgeUniqueid][BridgeNum] = { Timestamp: data.Timestamp, Uniqueid: data.Uniqueid, CallerIDNum : data.CallerIDNum, CallerIDName : data.CallerIDName, Channel : data.Channel, ChannelState : data.ChannelState, ConnectedLineNum : data.ConnectedLineNum, ConnectedLineName : data.ConnectedLineName, AccountCode : data.AccountCode};
        eventBridges({
            notification: bridge
        });
        //debug('eventBridgeEnter', data);
        debug('eventBridgeEnter', bridge);
    });

    ami.on('MusicOnHoldStop', function(data){
        debug('eventMusicOnHoldStop ', data);
        eventMusicOnHoldStop({
            notification: data
        });
        //debug('eventBridgeChange', bridge);
        //bridge.push[data.BridgeUniqueid] = data.BridgeUniqueid;
        //debug('eventBridgeCreate', bridge);
    });
    ami.on('MusicOnHoldStart', function(data){
            debug('eventMusicOnHoldStart ', data);
        eventMusicOnHoldStart({
            notification: data
        });
            //debug('eventBridgeChange ', bridge);
    //for (var i = 0, len = bridge.length; i < len; i++) {
            //debug('eventBridgeChange ', data.Uniqueid);
            //debug('eventBridgeChange ', bridge[i].ID);
        //if (bridge[i].Channel == data.Channel){
            //bridge[i].ChannelState = 'HOLD';
            //debug('eventBridgeChange', bridge[i].ID);
        //}

    //}
        //eventBridges({
            //notification: bridge
        //});
        //debug('eventBridgeChange', bridge);
        //bridge.push[data.BridgeUniqueid] = data.BridgeUniqueid;
        //debug('eventBridgeCreate', bridge);
    });

    //ami.on('eventHold', function(data){
    //for (var i = 0, len = bridge.length; i < len; i++) {
            ////debug('eventBridgeChange ', data.Uniqueid);
            ////debug('eventBridgeChange ', bridge[i].ID);
        //if (bridge[i].Channel == data.Channel){
            //bridge[i].ChannelState = 'HOLD';
            ////debug('eventBridgeChange', bridge[i].ID);
        //}
    //
    //}
        //eventBridges({
            //notification: bridge
        //});
        ////debug('eventBridgeChange', bridge);
        ////bridge.push[data.BridgeUniqueid] = data.BridgeUniqueid;
        ////debug('eventBridgeCreate', bridge);
    //});

    // Bridge event
    ami.on('BridgeCreate', function(data){
        //bridge.push[data.BridgeUniqueid] = data.BridgeUniqueid;
        bridge[data.BridgeUniqueid] = {};
        //debug('eventBridgeCreate', bridge);
    });
    // Bridge event
    ami.on('BridgeDestroy', function(data){
        delete bridge[data.BridgeUniqueid];
        //bridge[data.BridgeUniqueid] = {};
        debug('eventBridgeCreate', data);
    });

    // Hangup event
    ami.on('Hangup', function(data){
        connectionsArray.forEach(function(tmpSocket) {
            setTimeout(function() {
                tmpSocket.volatile.emit('Hangup', data);
            }, Math.floor(Math.random() * (100) + 1 ));
        });
        debug(data);
    });
    ami.on('DialBegin', function(data){
        connectionsArray.forEach(function(tmpSocket) {
            setTimeout(function() {
                tmpSocket.volatile.emit('DialBegin', data);
            }, Math.floor(Math.random() * (100) + 1 ));
        });
        debug(data);
    });
    ami.on('NewConnectedLine', function(data){
        connectionsArray.forEach(function(tmpSocket) {
            setTimeout(function() {
                tmpSocket.volatile.emit('NewConnectedLine', data);
            }, Math.floor(Math.random() * (100) + 1 ));
        });
        debug(data);
    });
    ami.on('QueueCallerLeave', function(data){
        connectionsArray.forEach(function(tmpSocket) {
            setTimeout(function() {
                tmpSocket.volatile.emit('QueueCallerLeave', data);
            }, Math.floor(Math.random() * (100) + 1 ));
        });
        debug(data);
    });
    ami.on('QueueCallerJoin', function(data){
        connectionsArray.forEach(function(tmpSocket) {
            setTimeout(function() {
                tmpSocket.volatile.emit('QueueCallerJoin', data);
            }, Math.floor(Math.random() * (100) + 1 ));
        });
        debug(data);
    });
    ami.on('DeviceStateChange', function(data){
        //debug(data);
        setTimeout(function() {
    connectionsArray.forEach(function(tmpSocket) {
        if (data.Device.indexOf('Custom:DND') != -1){
        var Device = data.Device.split(":DND");
            dnd = {}
            dnd.Exten = Device[1];
            dnd.Status = data.State;
            //debug(dnd);
            tmpSocket.volatile.emit('dndstate', dnd);
        }
    });
        }, Math.floor(Math.random() * (100) + 1 ));
    });
    ami.on('ExtensionStatus', function(data){
    connectionsArray.forEach(function(tmpSocket) {
        setTimeout(function() {
        tmpSocket.volatile.emit('extensionstate', data);
    }, Math.floor(Math.random() * (200) + 1 ));
    });
    });

});




function update_ExtensionStatus (res){
    setTimeout(function() {
        connectionsArray.forEach(function(tmpSocket) {
                tmpSocket.volatile.emit('extensionstate', res);
        });
    }, 300);
};

var eventBridges = function(data) {
setTimeout(function() {
  connectionsArray.forEach(function(tmpSocket) {
    tmpSocket.volatile.emit('eventBridges', data);
  });
}, 400);
};
var eventMusicOnHoldStop = function(data) {
  connectionsArray.forEach(function(tmpSocket) {
    tmpSocket.volatile.emit('eventMusicOnHoldStop', data);
  });
};
var eventMusicOnHoldStart = function(data) {
  connectionsArray.forEach(function(tmpSocket) {
    tmpSocket.volatile.emit('eventMusicOnHoldStart', data);
  });
};
var eventDialBegin = function(data) {
  connectionsArray.forEach(function(tmpSocket) {
    tmpSocket.volatile.emit('eventDialBegin', data);
  });
};
var eventDialEnd = function(data) {
  connectionsArray.forEach(function(tmpSocket) {
    tmpSocket.volatile.emit('eventDialEnd', data);
  });
};
var eventQueueCallerJoin = function(data) {
  connectionsArray.forEach(function(tmpSocket) {
    tmpSocket.volatile.emit('eventQueueCallerJoin', data);
  });
};
var eventQueueCallerLeave = function(data) {
  connectionsArray.forEach(function(tmpSocket) {
    tmpSocket.volatile.emit('eventQueueCallerLeave', data);
  });
};
var updateSockets = function(data) {
  data.time = new Date();
  connectionsArray.forEach(function(tmpSocket) {
    tmpSocket.volatile.emit('notification', data);
  });
};

var updateSockets1 = function(data) {
  data.time = new Date();
setTimeout(function() {
  connectionsArray.forEach(function(tmpSocket) {
    tmpSocket.volatile.emit('extensions', data);
  });
}, 400);
};
