var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var bcrypt = require('bcrypt');
var cookieParser = require('cookie-parser');

const uuidV1 = require('uuid/v1');
const fs = require('fs');

app.use(cookieParser());

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
  res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.header('Access-Control-Allow-Credentials', true);
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept'
  );
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  next();
});

app.use(bodyParser.json());

app.use((req, res, next) => {
  if (!req.cookies.userToken) {
    next();
    return;
  }

  const userToken = req.cookies.userToken; //grab token from cookie
  getFileData('./sessiondata.json', (err, parsedSessions) => {
    //get user ID to match user token
    if (err) {
      throw err;
    }
    if (!parsedSessions[userToken]) return res.status('401').next(); //if no matching user, return error code
    if (parsedSessions[userToken]) {
      let currentUserId = parsedSessions[userToken]; //set userId if token matches
      getFileData('./userdata.json', (err, parsedUsers) => {
        //get user data to match user ID
        if (err) {
          throw err;
        }
        req.user = parsedUsers.find(user => user.userId === currentUserId); //set req.user to found user
        req.next();
      });
    }
  });
});

// app.get((req, res) => {
//   console.log(req.user);
// });

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

app.get('/user', function(req, res) {
  //GETs logged in user
  console.log('GET from user!');
  if (!req.user) return res.status(403).end();
  console.log(`${req.user.userId}`);
  return res.json(req.user);
});

app.get('/users', function(req, res) {
  //GETs all users
  getFileData('./userdata.json', (err, parsedUsers) => {
    if (err) {
      throw err;
    }
    res.json(parsedUsers); // sending to the client as a object
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
    const user = parsedUsers.find(user => user.email === emailInput);
    //if no user found, send alert
    if (!user) return res.status(401).send('email');

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
          const sessionToken = uuidV1();
          parsedSessions[sessionToken] = userId; //add new session to sessiondata
          saveFileData('./sessiondata.json', parsedSessions, err => {
            if (err) throw err;
            res.cookie('userToken', sessionToken, {
              maxAge: 1000 * 60 * 150 // expires after 150 minutes
            });
            return res.send('success');
          });
        });
      }
      if (!match) {
        //if wrong password
        return res.status(401).send('password');
      }
    });
  });
});

// -then made an express middleware to check if the token in the cookie matches a user and then treat them as loggged in if it does:

app.post('/signup', function(req, res) {
  const saltRounds = 10;
  //POSTs a new user
  getFileData('./userdata.json', (err, parsedUsers) => {
    if (err) {
      throw err;
    }
    const user = parsedUsers.find(user => user.email === req.body.email);
    //if duplicate user found, send alert
    if (user) return res.status(401).end();

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
  if (!req.user) return res.status(403).end();
  getFileData('./listdata.json', (err, parsedLists) => {
    if (err) {
      throw err;
    }
    parsedLists = parsedLists.filter(list => list.creator === req.user.userId);
    res.json(parsedLists); // sending to the client as a object
  });
});

app.get('/list/:listName', function(req, res) {
  //GETs a single todo list
  if (!req.user) return res.status(403).end();
  getFileData('./listdata.json', (err, parsedLists) => {
    if (err) {
      throw err;
    }
    const name = req.params.listName;
    return res.json(
      parsedLists.find(
        list =>
          list.name.toLowerCase() === name.toLowerCase() &&
          list.creator === req.user.userId
      )
    );
  });
});

app.get('/list/:listName/todo/:id', function(req, res) {
  //GETs a single todo item
  if (!req.user) return res.status(403).end();
  getFileData('./listdata.json', (err, parsedLists) => {
    if (err) {
      throw err;
    }
    const name = req.params.listName;
    const todoId = req.params.id; //req.params.id pulls from :id part of url
    const foundList = parsedLists.find(
      list =>
        list.name.toLowerCase() === name.toLowerCase() &&
        list.creator === req.user.userId
    );
    return res.json(foundList.todoList.find(item => item.id === todoId));
  });
});

app.post('/create', function(req, res) {
  //POSTs a new todo list
  if (!req.user) return res.status(403).end();
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
  if (!req.user) return res.status(403).end();
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
  if (!req.user) return res.status(403).end();
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
  if (!req.user) return res.status(403).end();
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

app.put('/user/', function(req, res) {
  //PUT updates logged in user
  const userId = req.user.userId;
  const saltRounds = 10;

  if (!req.user) return res.status(403).end();
  console.log(`user exists`);
  getFileData('./userdata.json', (err, parsedUsers) => {
    if (err) {
      throw err;
    }
    if (req.query.changepassword === 'true') {
      console.log(`changepassword = true`);

      //change password
      //check to see if old password matches
      bcrypt.compare(req.body.oldPassword, req.user.password, function(
        err,
        match
      ) {
        if (err) {
          throw err;
        }
        if (match) {
          //if so, update password in userdata.json
          bcrypt.hash(req.body.newPassword, saltRounds, function(err, hash) {
            //hash new password
            console.log(`new hash ${hash}`);
            let updatedUser = Object.assign({}, req.user, { password: hash });
            console.log(`updated user ${updatedUser}`);

            const newUsers = parsedUsers.map(user => {
              if (user.userId !== userId) {
                return user;
              }
              return updatedUser;
            });
            console.log(`new users ${newUsers}`);

            saveFileData('./userdata.json', newUsers, err => {
              console.log(`saved`);
              if (err) throw err;
              return res.json(updatedUser);
            });
          });
        }
        if (!match) {
          //if wrong password
          return res.status(401).send('password');
        }
      });
    } else {
      console.log(`changepassword = false`);
      //change non-password fields
      const updatedUser = Object.assign({}, req.user, req.body);
      const newUsers = parsedUsers.map(user => {
        if (user.userId !== userId) {
          return user;
        }
        return updatedUser;
      });
      saveFileData('./userdata.json', newUsers, err => {
        if (err) throw err;
        res.json(updatedUser);
      });
    }
  });
});

app.delete('/list/:listName/todo/:id', function(req, res) {
  //DELETEs a todo item
  if (!req.user) return res.status(403).end();
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
  if (!req.user) return res.status(403).end();
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
