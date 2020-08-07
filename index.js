const express = require('express');
const http = require('http');
const socketio = require('socket.io');
var mysql = require('mysql');
const unread = {}; // This object will be later shifted to a cache
var connection = mysql.createPool({
    host: process.env.MYSQL_HOST || 'bajvkiejxkj0huht7zci-mysql.services.clever-cloud.com',
    user: process.env.MYSQL_USER || 'ujjo852okezglc86',
    password: process.env.MYSQL_PASS || 'iv2RACn8CfzqC3rFH4nY',
    database: process.env.MYSQL_DB || 'bajvkiejxkj0huht7zci',
    multipleStatements: true,
    connectionLimit: 2
});

const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = socketio(server);

const temp = {}; // This object will be later shifted to a cache
const temp_r = {}; // This object will be later shifted to a cache

io.on('connection', (socket)=>{
    socket.emit('getUserid');
    socket.on('noteUserid', (username)=>{
        if(temp[username]!=undefined){
            socket.emit('multipleLoginError');
            console.log(temp);
        }else{
            temp[username] = socket.id;
            temp_r[socket.id] = username;
            console.log(temp);
        }
    });
    // socket.broadcast.emit('showOnline', "A user is online"); // This is for showing that an user is online
    socket.on('getBroadcastMessages', (username)=>{
        var q = `SELECT * FROM chats WHERE sender=? AND receiver=-1 ORDER BY id`;
        connection.query(q, username, (err, result)=>{
            if(err){
                console.log(err);
            }else{
                socket.emit('sendingBroadcastMessages', result);
            }
        });
    });
    function addToUnread(data){
        var q = `SELECT number FROM unread Where username=? AND receiver=?`;
        connection.query(q, [data.user, data.receiver], (err, result)=>{
            if(err){
                console.log(err);
            }else{
                if(result.length == 0){
                    var payload = {
                        username: data.user,
                        receiver: data.receiver,
                        number: 1
                    };
                    connection.query(`INSERT INTO unread SET ?`, payload, (err, result)=>{
                        if(err){
                            console.log(err);
                        }else{
                            console.log(result);
                        }
                    });
                }else{
                    connection.query(`UPDATE unread SET number=number+1 WHERE username=? AND receiver=?`, [data.user, data.receiver], (err, result)=>{
                        if(err){
                            console.log(err);
                        }else{
                            console.log(result);
                        }
                    });
                }
            }
        });
    }
    socket.on('addToUnread', (data)=>{
        addToUnread(data);
    });
    socket.on('deleteFromUnread', (data)=>{
        var q = `DELETE FROM unread WHERE username=? and receiver=?`;
        connection.query(q, [data.user, data.receiver], (err, result)=>{
            if(err){
                console.log(err);
            }else{
                console.log(result);
            }
        });
    });
    socket.on('deleteFromUnreadCache', (data)=>{
        if(unread[`${data.user}-1`]!=undefined){
            if(unread[`${data.user}-1`][data.receiver]!=undefined){
                delete unread[`${data.user}-1`][data.receiver];
            }
            if(Object.keys(unread[`${data.user}-1`]).length==0){
                delete unread[`${data.user}-1`];
            }
        }
    });
    socket.on('checkUnread', (data)=>{
        var q = `SELECT * FROM unread WHERE username=? AND receiver=?`;
        connection.query(q, [data.user, data.receiver], (err, result)=>{
            if(err){
                console.log(err);
            }else{
                console.log(result);
                socket.emit('checked-unread', result);
            }
        });
    });
    socket.on('checkUnreadCache', (data)=>{
        if(unread[`${data.user}-1`]!=undefined){
            if(((unread[`${data.user}-1`])[data.receiver])!=undefined){
                socket.emit('checked-unread-cache', {
                    sender: data.user,
                    receiver: data.receiver,
                    number: unread[`${data.user}-1`][data.receiver]
                });
            }
        }
    });
    function addNewContacts_b(sender, notOnlineUsers){
        connection.query('SELECT * FROM broadcast_contact WHERE user=?', sender, (err, result)=>{
            if(err){
                console.log(err);
            }else{
                if(result.length==0){
                    var q1 = `SELECT user1, user2 FROM contacts WHERE `;
                    for(var i =0; i<notOnlineUsers.length; i++){
                        if(i==notOnlineUsers.length-1){
                            q1 += `((user1='${sender}' AND user2='${notOnlineUsers[i]}') OR (user1='${notOnlineUsers[i]}' AND user2='${sender}'))`;
                        }else{
                            q1 += `((user1='${sender}' AND user2='${notOnlineUsers[i]}') OR (user1='${notOnlineUsers[i]}' AND user2='${sender}')) OR `;
                        }
                    }
                    connection.query(q1, (err, result)=>{
                        if(err){
                            console.log(err);
                        }else{
                            var q2 = `INSERT INTO contacts (user1, user2) VALUES `;
                            for(var i =0; i<notOnlineUsers.length; i++){
                                console.log(result);
                                console.log(notOnlineUsers);
                                if((result.filter(e=> (e.user1==sender && e.user2==notOnlineUsers[i])).length == 0) && (result.filter(e=> (e.user2==sender && e.user1==notOnlineUsers[i])).length == 0)){
                                    if(notOnlineUsers[i]!=-1 && notOnlineUsers[i]!=sender){
                                        if(i==notOnlineUsers.length-1){
                                            q2 += `('${sender}', '${notOnlineUsers[i]}')`;
                                        }else{
                                            q2 += `('${sender}', '${notOnlineUsers[i]}'), `;
                                        }
                                    }
                                }
                            }
                            connection.query(q2, (err, result)=>{
                                if(err){
                                    console.log(err);
                                }else{
                                    connection.query(`INSERT INTO broadcast_contact SET ?`, {user: sender}, (err, result)=>{
                                        if(err){
                                            console.log(err);
                                        }else{
                                            console.log(result);
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
            }
        });
    }
    function addNewContact(data){
        var payload = {
            user1: data.user1,
            user2: data.user2
        };
        connection.query(`SELECT * FROM contacts WHERE (user1=? AND user2=?) OR (user2=? AND user1=?)`, [data.user1, data.user2, data.user1, data.user2], (err, result)=>{
            if(err){
                console.log(err);
            }else{
                if(result.length==0){
                    var q = `INSERT INTO contacts SET ?`;
                    connection.query(q, payload, (err, result)=>{
                        if(err){
                            console.log(err);
                        }else{
                            console.log(result);
                        }
                    });
                }
            }
        });
    }
    socket.on('addNewContact', (data)=>{
        addNewContact(data);
    });
    // Catching a new message for sender side
    socket.on('sendMessageClient_sender', (data)=>{
        socket.emit('populateMsg', JSON.stringify(data));
    });
    // Catching a new message
    socket.on('sendMessageClient', (data)=>{
        var msg = JSON.parse(data);
        var q = `INSERT INTO chats SET ?`;
        var payload = {
            txt: msg.txt,
            message_type : msg.msg_type,
            sender: msg.sender,
            receiver: msg.receiver
        };
        connection.query(q, payload, (err, result)=>{
            if(err){
                console.log(err);
            }else{
                console.log(result);
            }
        });
        if(msg.receiver == -1){
            var notOnlineUsers = [];
            socket.broadcast.emit('populateMsg', JSON.stringify(msg));
            connection.query('SELECT username FROM logins', (err, result)=>{
                if(err){
                    console.log(err);
                }else{
                    console.log(result);
                    if(unread[`${msg.sender}-1`]==undefined){
                        var t = {};
                        for(var i=0; i<result.length; i++){
                            if(temp[result[i].username]==undefined && result[i].username!=msg.receiver){
                                t[result[i].username] = 1;
                                notOnlineUsers.push(result[i].username);
                            }
                        }
                        if((Object.keys(t)).length>0){
                            unread[msg.sender+"-1"] = t;
                        }
                        if(notOnlineUsers.length>0){
                            addNewContacts_b(msg.sender, notOnlineUsers);
                        }
                    }else{
                        for(var j=0; j<result.length; j++){
                            if(result[j].username!=msg.receiver && temp[result[j].username]==undefined){
                                if((unread[`${msg.sender}-1`])[result[j].username]==undefined){
                                    (unread[`${msg.sender}-1`])[result[j].username] = 1;
                                }else{
                                    (unread[`${msg.sender}-1`])[result[j].username] = (unread[`${msg.sender}-1`])[result[j].username] + 1;
                                }
                            }
                        }
                    }
                }
                console.log(unread);
            });
        }else{
            if(temp[msg.receiver]!=undefined){ // This is to check if the user is online or not else we will not emit
                socket.broadcast.to(temp[msg.receiver]).emit('populateMsg', JSON.stringify(msg));
            }else{
                addNewContact({
                    user1: msg.sender,
                    user2: msg.receiver
                });
                addToUnread({
                    user: msg.sender,
                    receiver: msg.receiver
                });
            }
        }
    });
    socket.on('initialChats', (payload)=>{
        var q = `(SELECT * FROM chats WHERE message_type='type1' AND ((sender='${payload.sender}' AND receiver='${payload.receiver}') OR (sender='${payload.receiver}' AND receiver='${payload.sender}') OR (sender='${payload.receiver}' AND receiver='-1') OR (sender='${payload.sender}' AND receiver='-1')) ORDER BY id LIMIT ${payload.items}) UNION (SELECT * FROM chats WHERE message_type='type2' AND ((sender='${payload.sender}' AND receiver='${payload.receiver}') OR (sender='${payload.receiver}' AND receiver='${payload.sender}') OR (sender='${payload.receiver}' AND receiver='-1') OR (sender='${payload.sender}' AND receiver='-1')) ORDER BY id LIMIT ${payload.items}) UNION (SELECT * FROM chats WHERE message_type='type3' AND ((sender='${payload.sender}' AND receiver='${payload.receiver}') OR (sender='${payload.receiver}' AND receiver='${payload.sender}') OR (sender='${payload.receiver}' AND receiver='-1') OR (sender='${payload.sender}' AND receiver='-1')) ORDER BY id LIMIT ${payload.items}) UNION (SELECT * FROM chats WHERE message_type='type4' AND ((sender='${payload.sender}' AND receiver='${payload.receiver}') OR (sender='${payload.receiver}' AND receiver='${payload.sender}') OR (sender='${payload.receiver}' AND receiver='-1') OR (sender='${payload.sender}' AND receiver='-1')) ORDER BY id LIMIT ${payload.items})`;
        connection.query(q, (err, result)=>{
            if(err){
                console.log(err);
            }else{
                socket.emit('sendingInitialChats', result);
            }
        });
    });
    socket.on('searchForUser', (data)=>{
        var q = `SELECT username FROM logins WHERE username LIKE ?`;
        connection.query(q, `%${data}%`, (err, result)=>{
            if(err){
                console.log(err);
            }else{
                socket.emit('searchedUsers', result);
            }
        });
    });
    socket.on('disconnect', ()=>{
        // delete temp[temp[]username];
        username = temp_r[socket.id];
        try{
            delete temp[username];
            delete temp_r[socket.id];
        }catch(e){
            console.log("Extra tab closed.");
        }
        console.log(temp);
        io.emit('message', "A user has left");
    });
});


app.get('/getContacts', (req, res) => {
    if (req.query.user != undefined) {
        var q = `SELECT * FROM contacts WHERE user1=\'${req.query.user}\' OR user2=\'${req.query.user}\'`;
        connection.query(q, (err, result) => {
            if (err) {
                res.json({
                    "Error": err
                });
            } else {
                res.json(result);
            }
        });
    } else {
        console.log("Psss params");
        res.json({
            "Error": "Pass params"
        });
    }
});



server.listen(process.env.PORT || 3000, ()=>{
    console.log("Server on http://localhost:3000");
});