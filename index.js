var express = require('express');
var app = express();
var bodyParser = require('body-parser');
const uuidV1 = require('uuid/v1');

let todos = [];

app.use(function(req, res, next) { 
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE, DELETEALL");
    
    next();
});

app.use(bodyParser.json());

// req = request (what you got from the client)
// res = response (what you are sending back to client)
app.get('/todos', function (req, res) {
    res.json(todos)
})

app.post('/todos', function (req, res) {
    let newTodo =  Object.assign({}, req.body, {id:uuidV1()});  //create newTodo with body of request and give it an ID
    todos = [...todos, newTodo]                                 //update array on server with newTodo
    res.json(newTodo)                                           //respond with newTodo
})

app.put('/todos/:id', function (req, res) {
    const todoId = req.params.id;                           //req.params.id pulls from :id part of url
    const todo = todos.find((todo) => todo.id === todoId);  //find todo with matching ID. Create fresh array necessary? no but good practice
    let updatedTodo = Object.assign({}, todo, req.body)     // req.body needed? yes, otherwise has a bunch of random data

    todos = todos.map(item => {                             //create new instance of todos
        if (item.id !== todoId){ 
            return item;
        }
        else return updatedTodo;
    });

    res.json(updatedTodo) 
    // setTimeout(function(){
    //     res.json(updatedTodo) 

    // },1000)
})

app.delete('/todos/:id', function (req, res) {
    const todoId = req.params.id;
    todos = todos.filter((item) => item.id !== todoId);
    res.end();                                              //responds to client, tells it we are done
})

// {
//     text: "submit job application"
//     tags: ["WORK", "URGENT"]
// }
// DELETE /todos - delete all todos
// DELETE /todos?completed=true - delete all completed
// DELETE /todos?tags=WORK

// app.get('/', function(req, res){
//     console.log(req.query.name);
//     res.send('Response send to client::'+req.query.name);

// });

app.delete('/todos/', function (req, res) {
    if (req.query.completed === 'true' ){  //if deleting completed
        todos = todos.filter((item) => item.completed !== true);
        res.end();        
    }
    else{               //if deleting all
        todos = [];
        res.end();          
    }
                                    //responds to client, tells it we are done
})
  

app.listen(5000) //port