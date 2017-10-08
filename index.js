var express = require('express');
var app = express();
var bodyParser = require('body-parser');
const uuidV1 = require('uuid/v1');
const fs = require('fs');

// saveLists(newData, () => {

// })

//----

// res.setHeader("contentytpy = json")
// res.send("{a:b}")  => JSON.parse("{a:b}") = {a:b}
// =
// res.json({a: b})  => JSON.parse("{a:b}") = {a:b}

// res.json("{a:b}")
// =
// res.setHeader("contentytpy = json")
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

getListData = callback => {
  //reads from file and parses data for us
  fs.readFile('./listdata.json', 'utf8', function(err, data) {
    if (err) return callback(err);
    callback(null, JSON.parse(data));
  });
};

saveListData = (newData, callback) => {
  //saves to file and stringifys data for us
  fs.writeFile('./listdata.json', JSON.stringify(newData), function(err) {
    if (err) return callback(err);
    callback();
  });
};

app.get('/lists', function(req, res) {
  //GETs all lists
  getListData((err, parsedLists) => {
    if (err) {
      throw err;
    }
    res.json(parsedLists); // sending to the client as a object
  });
});

app.get('/list/:listName', function(req, res) {
  //GETs a single todo list
  getListData((err, parsedLists) => {
    if (err) {
      throw err;
    }
    const name = req.params.listName;
    parsedLists.forEach(list => {
      if (list.name === name) {
        return res.json(list);
      }
    });
    res.end();
  });
});

app.get('/list/:listName/:id', function(req, res) {
  //GETs a single todo item
  getListData((err, parsedLists) => {
    if (err) {
      throw err;
    }
    const name = req.params.listName;
    const todoId = req.params.id; //req.params.id pulls from :id part of url
    parsedLists.forEach(list => {
      if (list.name === name) {
        let todos = list.todoList;
        todos.forEach(item => {
          if (item.id === todoId) {
            return res.json(item);
          }
        });
      }
    });
    res.end();
  });
});

app.post('/create', function(req, res) {
  //POSTs a new todo list
  getListData((err, parsedLists) => {
    if (err) {
      throw err;
    }
    let newList = req.body; //create newTodo with body of request and give it an ID
    let newData = [newList, ...parsedLists]; //update array on server with newTodo
    saveListData(newData, err => {
      if (err) throw err;
      res.json(newList);
    });
  });
});

app.post('/list/:listName', function(req, res) {
  //POSTs a new todo item to a todo list
  getListData((err, parsedLists) => {
    if (err) {
      throw err;
    }
    const name = req.params.listName;
    let newTodo = Object.assign({}, req.body, { id: uuidV1() }); //create newTodo with body of request and give it an ID
    let newData = parsedLists;
    newData.forEach(list => {
      if (list.name === name) {
        list.todoList = [newTodo, ...list.todoList];
      }
    });
    saveListData(newData, err => {
      if (err) throw err;
      res.json(newTodo); //respond with newTodo
    });
  });
});

app.put('/list/:listName', function(req, res) {
  //PUT updates a list
  getListData((err, parsedLists) => {
    if (err) {
      throw err;
    }
    const name = req.params.listName;
    let newData = parsedLists;
    let updatedList = [];

    newData.forEach(list => {
      if (list.name === name) {
        list.name = req.body.name;
        updatedList = list;
      }
    });
    saveListData(newData, err => {
      if (err) throw err;
      res.json(updatedList); //respond with updatedList
    });
  });
});

app.put('/list/:listName/:id', function(req, res) {
  //PUT updates a todo item
  getListData((err, parsedLists) => {
    if (err) {
      throw err;
    }
    const name = req.params.listName;
    const todoId = req.params.id; //req.params.id pulls from :id part of url
    let newData = parsedLists;
    let todoToReturn = {};
    newData.forEach(list => {
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
    saveListData(newData, err => {
      if (err) throw err;
      res.json(todoToReturn);
    });
  });
});

app.delete('/list/:listName/:id', function(req, res) {
  //DELETEs a todo item
  getListData((err, parsedLists) => {
    if (err) {
      throw err;
    }
    const name = req.params.listName;
    const todoId = req.params.id;
    let newData = parsedLists;
    newData.forEach(list => {
      if (list.name === name) {
        list.todoList = list.todoList.filter(item => item.id !== todoId);
      }
    });
    saveListData(newData, err => {
      if (err) throw err;
      res.end();
    });
  });
});

app.delete('/list/:listName', function(req, res) {
  getListData((err, parsedLists) => {
    const name = req.params.listName;
    let newData = parsedLists;
    newData.forEach(list => {
      if (list.name === name) {
        //if clearing list of all completed
        if (req.query.completed === 'true') {
          list.todoList = list.todoList.filter(item => item.completed !== true);
        } else if (req.query.all === 'true') {
          //if clearing list of all items
          list.todoList = [];
        } else {
          //if deleting list altogether
          newData = newData.filter(list => list.name !== name);
        }
      }
    });
    saveListData(newData, err => {
      if (err) throw err;
      res.end();
    });
  });
});

app.listen(5000); //port

// setTimeout(function(){
//     res.json(updatedTodo)

// },1000)
