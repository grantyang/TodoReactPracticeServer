var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var bcrypt = require('bcrypt');
var cookieParser = require('cookie-parser');
var multer = require('multer');

const uuidV1 = require('uuid/v1');
const fs = require('fs');

app.use(cookieParser());

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

//app.use(express.static(__dirname, 'public'));

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

// configuring Multer to use files directory for storing files
// this is important because later we'll need to access file path
const storage = multer.diskStorage({
  destination: './uploadedPhotos',
  filename(req, file, callback) {
    callback(null, `${new Date()}-${file.originalname}`);
  }
});

var upload = multer({ storage });

app.get('/uploadedPhotos/:fileName', function(req, res) {
  res.writeHead(200, {
    'Content-Type': 'image/png'
  });
  fs.createReadStream(`./uploadedPhotos/${req.params.fileName}`).pipe(res);
});

// // alternatively, if we want to load the whole file before serving
// app.get('/files/:fileName', function(req, res) {
//   fs.readFile(`./files/${req.params.fileName}`, function(err, data) {
//     if (err) throw err;
//     res.write(data, 'image/png');
//     res.end();
//   });
// });

//ask CW put updating logic in here or pass path back to client to call update? call a put from a post? best practices
app.post('/uploadPhoto/', upload.single('photo'), function(req, res) {
  const file = req.file; // file passed from client
  if (!req.user) return res.status(403).end();
  if (!file) return res.status(400).send({ success: false });
  const meta = req.body; // all other values passed from the client, like name, etc..
  const host = req.hostname;
  const newPictureLink = req.protocol + '://' + host + ':5000/' + req.file.path;
  //now store path to this file in our listdata file
  if (req.query.type === 'profile') {
    const userId = req.user.userId;
    const updatedUser = Object.assign({}, req.user, {
      profilePictureLink: newPictureLink
    });
    getFileData('./userdata.json', (err, parsedUsers) => {
      if (err) {
        throw err;
      }
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
    });
  }

  //each todo item has an array that contains paths to photos uploaded to it
  //presentational component will read this array and for each, GET the proper resource from the images folder.
  if (req.query.type === 'todoitem') {
    getFileData('./listdata.json', (err, parsedLists) => {
      if (err) {
        throw err;
      }
      const name = req.query.listname;
      const todoId = req.query.todoid; //req.params.id pulls from :id part of url
      let todoToReturn = {};
      parsedLists.forEach(list => {
        if (list.name === name) {
          //find correct todos in LoL
          list.todos = list.todos.map(item => {
            // replace old todos with new one containing updated todo
            if (item.id !== todoId) {
              return item;
            }
            return (todoToReturn = Object.assign({}, item, {
              pictureLinks: item.pictureLinks.concat(newPictureLink)
            })); // adds new picture link to existing array
          });
        }
      });
      // console.log(todoToReturn);
      saveFileData('./listdata.json', parsedLists, err => {
        if (err) throw err;
        res.json(todoToReturn);
      });
    });
  }
});
// another way to do it is to use express static file server. google "express serve static files"
// expressStatic("/folder_name")

app.get('/users', function(req, res) {
  //GETs all users
  getFileData('./userdata.json', (err, parsedUsers) => {
    if (err) {
      throw err;
    }
    res.json(parsedUsers); // sending to the client as a object
  });
});

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
  if (!req.user) return res.status(403).end();
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
    if (req.query.authored === 'true') {
      parsedLists = parsedLists.filter(
        list => list.creator === req.user.userId
      );
      return res.json(parsedLists); // sending to the client as a object
    }
    parsedLists = parsedLists.filter(
      list =>
        list.creator === req.user.userId ||
        list.privacy === 'public' ||
        list.authorizedUsers.indexOf(req.user.userId) !== -1
    );
    return res.json(parsedLists); // sending to the client as a object
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
          (list.creator === req.user.userId ||
            list.privacy === 'public' ||
            list.authorizedUsers.indexOf(req.user.userId) !== -1)
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
        (list.creator === req.user.userId ||
          list.privacy === 'public' ||
          list.authorizedUsers.indexOf(req.user.userId) !== -1)
    );
    return res.json(foundList.todos.find(item => item.id === todoId));
  });
});

app.post('/create', function(req, res) {
  //POSTs a new todo list
  if (!req.user) return res.status(403).end();
  getFileData('./listdata.json', (err, parsedLists) => {
    if (err) {
      throw err;
    }
    //const newId = uuidV1();
    let newList = Object.assign({}, req.body, { id: uuidV1() }); //create new list with body of request and give it an ID
    let newData = [newList, ...parsedLists]; //Object.assign({}, parsedLists, { newId: newList });  //update object on server with newTodo
    saveFileData('./listdata.json', newData, err => {
      if (err) throw err;
    });
    res.json(newList);
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
        list.todos = [newTodo, ...list.todos];
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
    let updatedLists = [];
    if (req.query.authorizedusers === 'true') {
      //if updating authorized user list
      const newAuthorizedUserEmail = req.body.email;
      let listToReturn = {};
      getFileData('./userdata.json', (err, parsedUsers) => {
        if (err) {
          throw err;
        }
        //check for user existence
        if (!parsedUsers.find(user => user.email === newAuthorizedUserEmail))
          return res.status(404).send('no user');
        const newAuthorizedUserId = parsedUsers.find(
          user => user.email === newAuthorizedUserEmail
        ).userId; //grab userId of user
        //if new id is already in the list of authorized users, alert user
        if (
          parsedLists.find(
            list =>
              list.name === name &&
              list.authorizedUsers.find(
                userId => userId === newAuthorizedUserId
              )
          )
        )
          return res.status(404).send('duplicate');
        updatedLists = parsedLists.map(list => {
          if (list.name !== name) {
            return list;
          } else {
            //otherwise add it to the list
            const newAuthorizedUserList = [
              ...list.authorizedUsers,
              newAuthorizedUserId
            ];
            return (listToReturn = Object.assign({}, list, {
              authorizedUsers: newAuthorizedUserList
            }));
          }
        });
        saveFileData('./listdata.json', updatedLists, err => {
          if (err) throw err;
          res.json(listToReturn); //respond with listToReturn
        });
      });
    } else {
      //if updating other fields on todoList
      updatedLists = parsedLists.map(list => {
        if (list.name !== name) {
          return list;
        }
        return (listToReturn = Object.assign({}, list, req.body));
      });
      saveFileData('./listdata.json', updatedLists, err => {
        if (err) throw err;
        res.json(listToReturn); //respond with listToReturn
      });
    }
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
        //find correct todos in LoL
        list.todos = list.todos.map(item => {
          // replace old todos with new one containing updated todo
          if (item.id !== todoId) {
            return item;
          }
          return (todoToReturn = Object.assign({}, item, req.body)); // req.body needed? yes, otherwise has a bunch of random data
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
  getFileData('./userdata.json', (err, parsedUsers) => {
    if (err) {
      throw err;
    }
    if (req.query.changepassword === 'true') {
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
            let updatedUser = Object.assign({}, req.user, { password: hash });
            const newUsers = parsedUsers.map(user => {
              if (user.userId !== userId) {
                return user;
              }
              return updatedUser;
            });
            saveFileData('./userdata.json', newUsers, err => {
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
        list.todos = list.todos.filter(item => item.id !== todoId);
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
          list.todos = list.todos.filter(item => item.completed !== true);
        } else if (req.query.all === 'true') {
          //if clearing list of all items
          list.todos = [];
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
