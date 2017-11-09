var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var bcrypt = require('bcrypt');
var cookieParser = require('cookie-parser');
var multer = require('multer');
const uuidV1 = require('uuid/v1');
const fs = require('fs');

const pg = require('pg');
pg.types.setTypeParser(1114, str => str);

var connectionString = 'postgres://grantyang@localhost:5432/tododb';
const client = new pg.Client(connectionString);
client.connect();

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
    //if no cookie exists
    next();
    return;
  }
  const userToken = req.cookies.userToken; //grab token from cookie
  const text = 'SELECT * FROM active_sessions WHERE user_token = $1';
  const values = [userToken];
  client.query(text, values, (err, result) => {
    if (err) {
      throw err;
    }
    if (!result.rows[0]) return res.status('401'); //if no matching user, return error code

    if (result.rows[0]) {
      let currentUserId = result.rows[0].user_id; //set userId if token matches
      const text = 'SELECT * FROM users WHERE user_id = $1';
      const values = [currentUserId];
      client.query(text, values, (err, result) => {
        //get user data to match user ID
        if (err) {
          throw err;
        }
        req.user = result.rows[0]; //set req.user to found user
        next();
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

// another way to do it is to use express static file server. google "express serve static files"
// expressStatic("/folder_name")
app.get('/uploadedPhotos/:fileName', function(req, res) {
  res.writeHead(200, {
    'Content-Type': 'image/jpg'
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

app.post('/uploadPhoto/', upload.single('photo'), function(req, res) {
  const file = req.file; // file passed from client
  if (!req.user) return res.status(403).end();
  if (!file) return res.status(400).send({ success: false });
  const meta = req.body; // all other values passed from the client, like name, etc..
  const host = req.hostname;
  const newPictureLink = req.protocol + '://' + host + ':5000/' + req.file.path;
  //now store path to this file in our listdata file
  if (req.query.type === 'profile') {
    const userId = req.user.user_id;
    const text =
    `UPDATE users SET profile_picture_link = $1
    WHERE user_id = $2 RETURNING *`;
  const values = [newPictureLink, userId];
  client.query(text, values, (err, result) => {
    if (err) {
      throw err;
    }
    res.json(result.rows[0]);
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
      saveFileData('./listdata.json', parsedLists, err => {
        if (err) throw err;
        res.json(todoToReturn);
      });
    });
  }
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
  const text = 'SELECT * FROM users';
  const values = [];
  client.query(text, values, (err, result) => {
    if (err) {
      throw err;
    }
    res.json(result.rows);
  });
});

app.post('/login', function(req, res) {
  const passwordInput = req.body.password;
  const emailInput = req.body.email;

  const text = 'SELECT * FROM users WHERE email = $1';
  const values = [emailInput];
  client.query(text, values, (err, result) => {
    if (err) {
      throw err;
    }
    if (!result.rows[0]) {
      //if no matching email found, send alert
      return res.status(401).send('email');
    } else {
      const userId = result.rows[0].user_id;
      const hash = result.rows[0].password;
      bcrypt.compare(passwordInput, hash, function(err, match) {
        if (err) {
          throw err;
        }
        if (match) {
          //if sucessful login
          const text =
            'INSERT INTO active_sessions(user_id) VALUES($1) RETURNING *';
          const values = [userId];
          client.query(text, values, (err, result) => {
            if (err) {
              throw err;
            }
            res.cookie('userToken', result.rows[0].user_token, {
              maxAge: 1000 * 60 * 150 // expires after 150 minutes
            });
            return res.send('success');
          });
        }
        if (!match) {
          //if wrong password
          return res.status(401).send('password');
        }
      });
    }
  });
});

app.post('/signup', function(req, res) {
  const saltRounds = 10;
  //POSTs a new user
  const text = 'SELECT * FROM users WHERE email = $1';
  const values = [req.body.email];
  client.query(text, values, (err, res) => {
    if (err) {
      throw err;
    }
    if (res.rows[0]) {
      //if duplicate user found, send alert
      return res.status(401).end();
    } else {
      bcrypt.hash(req.body.password, saltRounds, function(err, hash) {
        const text =
          'INSERT INTO users(name, email, password, profile_picture_link, user_custom_tags) VALUES($1, $2, $3, $4, $5) RETURNING *';
        const values = [
          req.body.name,
          req.body.email,
          hash,
          req.body.profilePictureLink,
          req.body.userCustomTags
        ];
        client.query(text, values, (err, res) => {
          if (err) {
            throw err;
          }
          return res.rows[0];
        });
      });
    }
  });
});

// getFileData('./userdata.json', (err, parsedUsers) => {
//   if (err) {
//     throw err;
//   }
//   const user = parsedUsers.find(user => user.email === req.body.email);
//   //if duplicate user found, send alert
//   if (user) return res.status(401).end();

//   let newUser = Object.assign({}, req.body, { userId: uuidV1() }); //create user with body of request and give it an ID
//   bcrypt.hash(newUser.password, saltRounds, function(err, hash) {
//     // Store hashed pw in DB.
//     newUser.password = hash;
//     let newUsers = [newUser, ...parsedUsers];

//     saveFileData('./userdata.json', newUsers, err => {
//       if (err) throw err;
//       res.json(newUser);
//     });
//   });
// });

app.get('/lists', function(req, res) {
  //GETs all lists
  if (!req.user) return res.status(403).end();
  if (req.query.authored === 'true') {
    const text = 'SELECT * FROM todo_lists WHERE creator = $1';
    const values = [req.user.user_id];
    client.query(text, values, (err, result) => {
      if (err) {
        throw err;
      }
      res.json(result.rows);
    });
  }
  const text = `SELECT todo_lists.list_id, todo_lists.name, todo_lists.creator, todo_lists.privacy, COUNT(todos.todo_id)
  FROM todo_lists 
  LEFT JOIN todos ON todos.owner_id=todo_lists.list_id 
  LEFT JOIN list_permissions ON list_permissions.list_id=todo_lists.list_id 
  WHERE creator = $1 OR privacy = $2 OR user_id = $1
  GROUP BY todo_lists.list_id, todo_lists.name, todo_lists.creator, todo_lists.privacy`;
  const values = [req.user.user_id, 'public'];
  client.query(text, values, (err, result) => {
    if (err) {
      throw err;
    }
    res.json(result.rows);
  });
});

app.get('/list/:listName', function(req, res) {
  //GETs a single todo list
  if (!req.user) return res.status(403).end();
  const text = `SELECT todo_lists.list_id, creator, name, privacy, todo_id, owner_id, text, completed, tag, due_date, latitude, longitude, rich_text_comment
  FROM todo_lists  
  LEFT JOIN todos ON todo_lists.list_id=todos.owner_id  
  LEFT JOIN list_permissions ON list_permissions.list_id=todo_lists.list_id   
  WHERE todo_lists.name = $1 AND (todo_lists.creator =$2 OR user_id = $2 OR privacy = $3)`;
  const values = [req.params.listName, req.user.user_id, 'public'];
  client.query(text, values, (err, result) => {
    if (err) {
      throw err;
    }
    res.json(result.rows);
  });
});

app.get('/list/:listName/todo/:id', function(req, res) {
  //GETs a single todo item
  //GY add authoried users, etc
  if (!req.user) return res.status(403).end();
  const text = `SELECT * FROM todo_lists 
  JOIN todos ON todo_lists.list_id=todos.owner_id  
  LEFT JOIN list_permissions ON list_permissions.list_id=todo_lists.list_id  
  WHERE todo_id = $1 AND (todo_lists.creator =$2 OR user_id = $2 OR privacy = $3)`;
  const values = [req.params.id, req.user.user_id, 'public'];
  client.query(text, values, (err, result) => {
    if (err) {
      throw err;
    }
    res.json(result.rows[0]);
  });
});

app.post('/create', function(req, res) {
  //POSTs a new todo list
  if (!req.user) return res.status(403).end();
  const text =
    'INSERT INTO todo_lists(creator, name, privacy) VALUES($1, $2, $3) RETURNING *';
  const values = [req.body.creator, req.body.name, req.body.privacy];
  client.query(text, values, (err, result) => {
    if (err) {
      throw err;
    }
    res.json(result.rows[0]);
  });
});

app.post('/list/:listName', function(req, res) {
  //POSTs a new todo item to a todo list
  if (!req.user) return res.status(403).end();
  const text = `INSERT INTO todos(owner_id, text, completed, tag, due_date, latitude, longitude, rich_text_comment) 
    VALUES($1, $2, $3, $4, $5, $6, $7, $8) 
    RETURNING *`;
  const values = [
    req.body.ownerId,
    req.body.text,
    req.body.completed,
    req.body.tag,
    req.body.dueDate,
    req.body.latitude,
    req.body.longitude,
    req.body.richTextComment
  ];
  client.query(text, values, (err, result) => {
    if (err) {
      throw err;
    }
    res.json(result.rows[0]);
  });
});

app.post('/listpermissions/:listName', function(req, res) {
  //POSTs a new authorized user
  if (!req.user) return res.status(403).end();
  const text = `SELECT * FROM users WHERE email = $1`;
  const values = [req.body.email];
  //check is entered user email exists
  client.query(text, values, (err, result) => {
    if (err) {
      throw err;
    }
    if (result.rows[0]) {
      const text = ` SELECT * FROM list_permissions 
      JOIN users ON list_permissions.user_id = users.user_id 
      AND users.email = $1
      JOIN todo_lists ON list_permissions.list_id = todo_lists.list_id
      AND todo_lists.name = $2`;
      const values = [req.body.email, req.params.listName];
      //check to see if user is already authorized
      client.query(text, values, (err, result) => {
        if (err) {
          throw err;
        }
        if (result.rows[0]) {
          return res.status(404).send('duplicate');
        }
        const text = `INSERT INTO list_permissions (user_id, list_id)
        SELECT users.user_id, todo_lists.list_id 
        FROM users, todo_lists 
        WHERE users.email = $1
        AND todo_lists.name = $2
        RETURNING *`;
        const values = [req.body.email, req.params.listName];
        //else, add user to list_permissions database
        client.query(text, values, (err, result) => {
          if (err) {
            throw err;
          }
          return res.json(result.rows[0]);
        });
      });
    } else return res.status(404).send('no user');
  });
});

app.put('/list/:listName', function(req, res) {
  //PUT updates a list
  if (!req.user) return res.status(403).end();
  const text =
    'UPDATE todo_lists SET name = $1, privacy = $2 WHERE name = $3  RETURNING *';
  const values = [req.body.name, req.body.privacy, req.params.listName];
  client.query(text, values, (err, result) => {
    if (err) {
      throw err;
    }
    res.json(result.rows);
  });
});

//   getFileData('./userdata.json', (err, parsedUsers) => {
//     if (err) {
//       throw err;
//     }
//     //check for user existence
//     if (!parsedUsers.find(user => user.email === newAuthorizedUserEmail))
//       return res.status(404).send('no user');
//     const newAuthorizedUserId = parsedUsers.find(
//       user => user.email === newAuthorizedUserEmail
//     ).userId; //grab userId of user
//     //if new id is already in the list of authorized users, alert user
//     if (
//       parsedLists.find(
//         list =>
//           list.name === name &&
//           list.authorizedUsers.find(
//             userId => userId === newAuthorizedUserId
//           )
//       )
//     )
//       return res.status(404).send('duplicate');
//     updatedLists = parsedLists.map(list => {
//       if (list.name !== name) {
//         return list;
//       } else {
//         //otherwise add it to the list
//         const newAuthorizedUserList = [
//           ...list.authorizedUsers,
//           newAuthorizedUserId
//         ];
//         return (listToReturn = Object.assign({}, list, {
//           authorizedUsers: newAuthorizedUserList
//         }));
//       }
//     });
//     saveFileData('./listdata.json', updatedLists, err => {
//       if (err) throw err;
//       res.json(listToReturn); //respond with listToReturn
//     });
//   });
// }

app.put('/list/:listName/todo/:id', function(req, res) {
  //PUT updates a todo item
  if (!req.user) return res.status(403).end();
  const text =
    `UPDATE todos SET text = $1, completed = $2, tag = $3, due_date = $4, latitude = $5, longitude = $6, rich_text_comment = $7 
    WHERE todo_id = $8 RETURNING *`;
  const values = [
    req.body.text,
    req.body.completed,
    req.body.tag,
    req.body.dueDate,
    req.body.latitude,
    req.body.longitude,
    req.body.richTextComment,
    req.params.id
  ];
  client.query(text, values, (err, result) => {
    if (err) {
      throw err;
    }
    res.json(result.rows[0]);
  });
});

app.put('/user/', function(req, res) {
  //PUT updates logged in user
  const userId = req.user.user_id;
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
  text = 'DELETE FROM todos WHERE todo_id = $1';
  values = [req.params.id];
  client.query(text, values, (err, result) => {
    if (err) {
      throw err;
    }
    res.end();
    return;
  });
});

app.delete('/list/:listName', function(req, res) {
  if (!req.user) return res.status(403).end();
  let text = 'SELECT * FROM todo_lists WHERE name = $1';
  let values = [req.params.listName];
  client.query(text, values, (err, result) => {
    if (err) {
      throw err;
    }
    if (req.query.completed === 'true') {
      text = 'DELETE FROM todos WHERE owner_id = $1 AND completed = true';
      values = [result.rows[0].list_id];
      client.query(text, values, (err, result) => {
        if (err) {
          throw err;
        }
        return;
      });
    } else if (req.query.all === 'true') {
      text = 'DELETE FROM todos WHERE owner_id = $1';
      values = [result.rows[0].list_id];
      client.query(text, values, (err, result) => {
        if (err) {
          throw err;
        }
        return;
      });
    } else {
      text = 'DELETE FROM todos WHERE owner_id = $1'; //delete todos from todo table
      values = [result.rows[0].list_id];
      client.query(text, values, (err, result) => {
        if (err) {
          throw err;
        }
      });
      text = 'DELETE FROM todo_lists WHERE list_id = $1'; //delete list from todo_list table
      values = [result.rows[0].list_id];
      client.query(text, values, (err, result) => {
        if (err) {
          throw err;
        }
        return;
      });
    }
    res.end();
  });
});

app.listen(5000); //port

// setTimeout(function(){
//     res.json(updatedTodo)

// },1000)
