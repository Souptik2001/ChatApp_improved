var fs = require('fs');
const express = require('express');
const http = require('http');
const socketio = require('socket.io');
var mysql = require('mysql');
var unread = {};
const jwt = require('jsonwebtoken');
var connection = mysql.createPool({
    host: process.env.MYSQL_HOST || 'bajvkiejxkj0huht7zci-mysql.services.clever-cloud.com',
    user: process.env.MYSQL_USER || 'ujjo852okezglc86',
    password: process.env.MYSQL_PASS || 'iv2RACn8CfzqC3rFH4nY',
    database: process.env.MYSQL_DB || 'bajvkiejxkj0huht7zci',
    connectionLimit: 2
});
// The unread data is backup to a file so that is somehow the program crashes then the data is not lost
try{
    unread = JSON.parse(fs.readFileSync('./unreads', 'utf8'));
}catch{
    fs.writeFile('./unreads', '{}', (err)=>{
        if(err){
            console.log(err);
        }
    });
}
console.log(unread);

const cors = require('cors');

const app = express();
app.use(express.json());
// This is for avoiding the CORS error that is we can call the backend API from the browser
app.use(cors());
const server = http.createServer(app);
const io = socketio(server);

const temp = {}; 
const temp_r = {}; 

io.on('connection', (socket)=>{
    // Client provides the username and server stores the username and its socket.id as key-value pair in temp object and temp_r is just the opposite key-value pair.
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
    // When a clien clicks on the broadcast tab this event will be needed to load its broadcast messages
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
    // Function to update the unread object
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
    // Cathes the event to add to unread from client
    socket.on('addToUnread', (data)=>{
        addToUnread(data);
    });
    // Client tells the server to delete from unread table
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
    // Client tells user ti delete from unread cache(object)
    // To be changed
    socket.on('deleteFromUnreadCache', (data)=>{
        if(unread[data.receiver]!=undefined){
            if(unread[data.receiver][data.user]!=undefined){
                delete unread[data.receiver][data.user];
            }
            if(Object.keys(unread[data.receiver]).length==0){
                delete unread[data.receiver];
            }
        }
        fs.writeFile('./unreads', JSON.stringify(unread), (err)=>{
            if(err){
                console.log(err);
            }
        });
    });
    // Client tells the server 
    socket.on('checkUnread', (data)=>{
        var q = `SELECT * FROM unread WHERE receiver=?`;
        connection.query(q, data, (err, result)=>{
            if(err){
                console.log(err);
            }else{
                console.log(result);
                socket.emit('checked-unread', result);
            }
        });
    });
    socket.on('checkUnreadCache', (data)=>{
        if(unread[data]!=undefined){
            socket.emit('checked-unread-cache' ,unread[data]);
        }
    });
    // Function for creating new contact
    function addNewContact(data){
        /*
        Sample data
            data ->{
                user: "Sample user",
                subs: {
                    u2 : true,
                    u5: true,
                    u8: true
                }
            }
        */
        var payload = { // The subs entry will contain the new object of subs
            subs: JSON.stringify(data.subs)
        };
        connection.query(`UPDATE contacts SET ? WHERE user=?`, [payload, data.user], (err, result)=>{
            if(err){
                console.log(err);
            }else{
                console.log(result);
            }
        });
    }
    // Event of creating a new contact
    socket.on('addNewContact', (data)=>{
        addNewContact(data);
    });
    // Catching a new message
    socket.on('sendMessageClient', (data)=>{
        var msg = JSON.parse(data);
        // Inserting the new message in the chats table
        var sorted = [msg.sender, msg.receiver].sort();
        var combined = `${sorted[0]}-${sorted[1]}`;
        var q = `INSERT INTO chats SET ?`;
        var payload = {
            txt: msg.txt,
            message_type : msg.msg_type,
            sender: msg.sender,
            receiver: msg.receiver,
            token: combined
        };
        console.log(payload);
        connection.query(q, payload, (err, result)=>{
            if(err){
                console.log(err);
            }else{
                console.log(result);
            }
        });
        // Providing the message to the subscriber/receiver
        // If the message is a broadcast message
        if(msg.receiver == -1){
            // Broadcasting the message to the online users
            socket.broadcast.emit('populateMsg', JSON.stringify(msg));
            // Appending to the unread object for the "offline users"
            connection.query('SELECT username FROM logins', (err, result)=>{
                if(err){
                    console.log(err);
                }else{
                    for(var i =0; i< result.length; i++){
                        // Checking that this user is not online
                        if(temp[result[i].username]==undefined){
                            // No unread broadcast messages for that user
                            if(unread[result[i].username]==undefined){
                                unread[result[i].username] = {};
                                unread[result[i].username][msg.sender] = 1;
                            // Already unread present
                            }else{
                                unread[result[i].username][msg.sender] += 1;
                            }
                        }
                    }
                }
                fs.writeFile('./unreads', JSON.stringify(unread), (err)=>{
                    if(err){
                        console.log(err);
                    }
                });
                console.log(unread);
            });
            // If the message is a normal message
        }else{
            if(msg.newConnection==1){ // This is to check if the "publisher" has a contact with the "subscriber" "publisher"->"subscriber" relationship. "subscriber"->"publisher" will be checked in the publisher client side
                addNewContact({ // If not then add it to contact
                    user: msg.sender,
                    subs: msg.subs
                });
            }
            if(temp[msg.receiver]!=undefined){ // This is to check if the user is online or not else we will not emit
                socket.broadcast.to(temp[msg.receiver]).emit('populateMsg', JSON.stringify(msg));
            }else{
                addToUnread({
                    user: msg.sender,
                    receiver: msg.receiver
                });
            }
        }
    });
    socket.on('initialChats', (payload)=>{
        var sorted = [payload.sender, payload.receiver].sort();
        var combined = `${sorted[0]}-${sorted[1]}`;
        var q = `(SELECT * FROM chats WHERE message_type='type1' AND (token='${combined}' OR receiver='-1') ORDER BY id LIMIT ${payload.items}) UNION (SELECT * FROM chats WHERE message_type='type2' AND (token='${combined}' OR receiver='-1') ORDER BY id LIMIT ${payload.items}) UNION (SELECT * FROM chats WHERE message_type='type3' AND (token='${combined}' OR receiver='-1') ORDER BY id LIMIT ${payload.items}) UNION (SELECT * FROM chats WHERE message_type='type4' AND (token='${combined}' OR receiver='-1') ORDER BY id LIMIT ${payload.items})`;
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
                console.log(result);
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
        var q = `SELECT * FROM contacts WHERE user=?`;
        connection.query(q, req.query.user, (err, result) => {
            if (err) {
                res.json({
                    "Error": err
                });
            } else {
                res.json(result);
            }
        });
    } else {
        res.json({
            "Error": "Pass params"
        });
    }
});

app.post('/login', (req, res)=>{
    console.log(req.body.user + ' ' + req.body.pass);
    var  q = `SELECT username FROM logins WHERE username=? AND password=?`;
    connection.query(q, [req.body.user, req.body.pass], (err, result)=>{
        if(err){
            console.log(err);
        }else{
            var t;
            if(result.length==0){
                // Wrong cred
                t = { token: "error" };
            }else{
                var user = { name: result[0].username };
                t = { name: result[0].username, token: jwt.sign(user, process.env.ACCESS_TOKEN || 'secret_token')}; 
            }
            res.json(t);
        }
    });
});

app.post('/verify', (req, res)=>{
    jwt.verify(req.body.token, process.env.ACCESS_TOKEN || 'secret_token', (err, user) => {
        if (err) {
            res.json({"Error": "User not identified"});
        }else{
            res.json({"Success": "User Validation successfull"});
        }
    });
});


server.listen(process.env.PORT || 3000, ()=>{
    console.log("Server on http://localhost:3000");
});