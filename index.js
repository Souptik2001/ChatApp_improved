const express = require('express');
const http = require('http');
const socketio = require('socket.io');
var mysql = require('mysql');
var connection = mysql.createPool({
    host: process.env.MYSQL_HOST || 'bajvkiejxkj0huht7zci-mysql.services.clever-cloud.com',
    user: process.env.MYSQL_USER || 'ujjo852okezglc86',
    password: process.env.MYSQL_PASS || 'iv2RACn8CfzqC3rFH4nY',
    database: process.env.MYSQL_DB || 'bajvkiejxkj0huht7zci',
    multipleStatements: true,
    connectionLimit: 10
});

const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = socketio(server);

const temp = {};
const temp_r = {}; // Temporarily this object later to be shifted to a cache

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
        console.log(payload);
        connection.query(q, payload, (err, result)=>{
            if(err){
                console.log(err);
            }else{
                console.log(result);
            }
        });
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
    });
    socket.on('initialChats', (payload)=>{
        var q = `(SELECT * FROM chats WHERE message_type='type1' AND ((sender='${payload.sender}' AND receiver='${payload.receiver}') OR (sender='${payload.receiver}' AND receiver='${payload.sender}')) ORDER BY id LIMIT ${payload.items}) UNION (SELECT * FROM chats WHERE message_type='type2' AND ((sender='${payload.sender}' AND receiver='${payload.receiver}') OR (sender='${payload.receiver}' AND receiver='${payload.sender}')) ORDER BY id LIMIT ${payload.items}) UNION (SELECT * FROM chats WHERE message_type='type3' AND ((sender='${payload.sender}' AND receiver='${payload.receiver}') OR (sender='${payload.receiver}' AND receiver='${payload.sender}')) ORDER BY id LIMIT ${payload.items}) UNION (SELECT * FROM chats WHERE message_type='type4' AND ((sender='${payload.sender}' AND receiver='${payload.receiver}') OR (sender='${payload.receiver}' AND receiver='${payload.sender}')) ORDER BY id LIMIT ${payload.items})`;
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