var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var bcrypt = require('bcrypt');
const uuidV1 = require('uuid/v1');
const fs = require('fs');

// res.setHeader("contenttype = json")
// res.send("{a:b}")  => JSON.parse("{a:b}") = {a:b}
// =
// res.json({a: b})  => JSON.parse("{a:b}") = {a:b}

// res.json("{a:b}")
// =
// res.setHeader("contenttype = json")
// res.send("\{a\:b\}") JSON.parse("\{a\:b\}") = "{a:b}" JSON.parse( "{a:b}")

app.use(function(req, res, next) {
  // Any client can get this information, I dont care what URL they are on
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept'
  );
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  next();
});

app.use(bodyParser.json());

// req = request (what you got from the client)
// res = response (what you are sending back to client)

getFileData = (fileName, callback) => {
  //reads from file and parses data for us
  fs.readFile(fileName, 'utf8', function(err, data) {
    if (err) return callback(err);
    callback(null, JSON.parse(data));
  });
};

saveFileData = (fileName, newData, callback) => {
  //saves to file and stringifys data for us
  fs.writeFile(fileName, JSON.stringify(newData), function(err) {
    if (err) return callback(err);
    callback();
  });
};

app.get('/users', function(req, res) {
  //GETs all users
  getFileData('./userdata.json', (err, parsedUsers) => {
    if (err) {
      throw err;
    }
    res.json(parsedUsers); // sending to the client as a object
  });
});

app.get('/user/:userId', function(req, res) {
  //GETs a single user
  getFileData('./userdata.json', (err, parsedUsers) => {
    if (err) {
      throw err;
    }
    const userId = req.params.userId;
    return res.json(parsedUsers.find(user => user.Id === userId))
  });
});

app.post('/login', function(req, res) {
  let loginSuccess = false;
  const passwordInput = req.body.password;
  const emailInput = req.body.email;
  getFileData('./userdata.json', (err, parsedUsers) => {
    if (err) {
      throw err;
    }
    //find proper user
    //if no user found, send alert
    //if found, run check.

    const user = parsedUsers.find(user => user.email === emailInput);
    if (!user) return res.send('email');
    const userId = user.userId;
    const hash = user.password;

    bcrypt.compare(passwordInput, hash, function(err, match) {
      if (err) {
        throw err;
      }
      if (match) {
        //if sucessful login
        getFileData('./sessiondata.json', (err, parsedSessions) => {
          //get old sessions from sessiondata
          if (err) {
            throw err;
          }
          parsedSessions[userId] = uuidV1(); //add new session to sessiondata
          saveFileData('./sessiondata.json', parsedSessions, err => {
            if (err) throw err;
            return res.send(parsedSessions[userId]);
          });
        });
      }
      if (!match) {
        return res.send('password');
      }
    });
  });
});

//if login is successful, give client a uuid token that they will store in a cookie
// Store the uuid in a cookie so it gets sent to the server on each request.
// login is a POST, if the info is correct for user then respond with 200 and set "token" cookie to be uuid() which you also store on the server
// -then made an express middleware to check if the token in the cookie matches a user and then treat them as loggged in if it does:

app.post('/signup', function(req, res) {
  const saltRounds = 10;
  //POSTs a new user
  getFileData('./userdata.json', (err, parsedUsers) => {
    if (err) {
      throw err;
    }
    let newUser = Object.assign({}, req.body, { userId: uuidV1() }); //create user with body of request and give it an ID
    bcrypt.hash(newUser.password, saltRounds, function(err, hash) {
      // Store hashed pw in DB.
      newUser.password = hash;
      let newUsers = [newUser, ...parsedUsers];

      saveFileData('./userdata.json', newUsers, err => {
        if (err) throw err;
        res.json(newUser);
      });
    });
  });
});

app.get('/lists', function(req, res) {
  //GETs all lists
  getFileData('./listdata.json', (err, parsedLists) => {
    if (err) {
      throw err;
    }
    res.json(parsedLists); // sending to the client as a object
  });
});

app.get('/list/:listName', function(req, res) {
  //GETs a single todo list
  getFileData('./listdata.json', (err, parsedLists) => {
    if (err) {
      throw err;
    }
    const name = req.params.listName;
    return res.json(parsedLists.find(list => list.name.toLowerCase() === name.toLowerCase()));
    
  });
});

app.get('/list/:listName/todo/:id', function(req, res) {
  //GETs a single todo item
  getFileData('./listdata.json', (err, parsedLists) => {
    if (err) {
      throw err;
    }
    const name = req.params.listName;
    const todoId = req.params.id; //req.params.id pulls from :id part of url
    
    const foundList = parsedLists.find(list => list.name === name)
    return res.json(foundList.todoList.find(item => item.id === todoId));
  });
});

app.post('/create', function(req, res) {
  //POSTs a new todo list
  getFileData('./listdata.json', (err, parsedLists) => {
    if (err) {
      throw err;
    }
    let newList = req.body; //create newTodo with body of request and give it an ID
    let newData = [newList, ...parsedLists]; //update array on server with newTodo
    saveFileData('./listdata.json', newData, err => {
      if (err) throw err;
      res.json(newList);
    });
  });
});

app.post('/list/:listName', function(req, res) {
  //POSTs a new todo item to a todo list
  getFileData('./listdata.json', (err, parsedLists) => {
    if (err) {
      throw err;
    }
    const name = req.params.listName;
    let newTodo = Object.assign({}, req.body, { id: uuidV1() }); //create newTodo with body of request and give it an ID
    parsedLists.forEach(list => {
      if (list.name === name) {
        list.todoList = [newTodo, ...list.todoList];
      }
    });
    saveFileData('./listdata.json', parsedLists, err => {
      if (err) throw err;
      res.json(newTodo); //respond with newTodo
    });
  });
});

app.put('/list/:listName', function(req, res) {
  //PUT updates a list
  getFileData('./listdata.json', (err, parsedLists) => {
    if (err) {
      throw err;
    }
    const name = req.params.listName;
 
    let updatedList = [];

    parsedLists.forEach(list => {
      if (list.name === name) {
        list.name = req.body.name;
        updatedList = list;
      }
    });
    saveFileData('./listdata.json', parsedLists, err => {
      if (err) throw err;
      res.json(updatedList); //respond with updatedList
    });
  });
});

app.put('/list/:listName/todo/:id', function(req, res) {
  //PUT updates a todo item
  getFileData('./listdata.json', (err, parsedLists) => {
    if (err) {
      throw err;
    }
    const name = req.params.listName;
    const todoId = req.params.id; //req.params.id pulls from :id part of url
    let todoToReturn = {};
    parsedLists.forEach(list => {
      if (list.name === name) {
        //find correct todoList in LoL
        const oldTodo = list.todoList.find(todo => todo.id === todoId); //find todo with matching ID. Create fresh array necessary? no but good practice
        let updatedTodo = Object.assign({}, oldTodo, req.body); // req.body needed? yes, otherwise has a bunch of random data
        list.todoList = list.todoList.map(item => {
          // replace old todoList with new one containing updated todo
          if (item.id !== todoId) {
            return item;
          }
          todoToReturn = updatedTodo;
          return updatedTodo;
        });
      }
    });
    saveFileData('./listdata.json', parsedLists, err => {
      if (err) throw err;
      res.json(todoToReturn);
    });
  });
});

app.delete('/list/:listName/todo/:id', function(req, res) {
  //DELETEs a todo item
  getFileData('./listdata.json', (err, parsedLists) => {
    if (err) {
      throw err;
    }
    const name = req.params.listName;
    const todoId = req.params.id;
    parsedLists.forEach(list => {
      if (list.name === name) {
        list.todoList = list.todoList.filter(item => item.id !== todoId);
      }
    });
    saveFileData('./listdata.json', parsedLists, err => {
      if (err) throw err;
      res.end();
    });
  });
});

app.delete('/list/:listName', function(req, res) {
  getFileData('./listdata.json', (err, parsedLists) => {
    const name = req.params.listName;
    parsedLists.forEach(list => {
      if (list.name === name) {
        if (req.query.completed === 'true') {
          //if clearing list of all completed
          list.todoList = list.todoList.filter(item => item.completed !== true);
        } else if (req.query.all === 'true') {
          //if clearing list of all items
          list.todoList = [];
        } else {
          //if deleting list altogether
          parsedLists = parsedLists.filter(list => list.name !== name);
        }
      }
    });
    saveFileData('./listdata.json', parsedLists, err => {
      if (err) throw err;
      res.end();
    });
  });
});

app.listen(5000); //port

// setTimeout(function(){
//     res.json(updatedTodo)

// },1000)

// app.use((req, res, next) => {
//   if (!req.cookie.token) {
//     next();
//     return;
//   }
// });

// getTokenData(tokens => {
//   var currentUserId = tokens[req.cookie.token];
//   if (!currentUserId) return next();
//   getUserData(currentUserId, (err, user) => {
//     req.user = user.next();
//   });
// });

// app.get((req, res) => {
//   console.log(req.user);
// });
