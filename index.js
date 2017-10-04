var express = require('express');
var app = express();
var bodyParser = require('body-parser');
const uuidV1 = require('uuid/v1');

let listOfLists = [];

app.use(function(req, res, next) { 
    // Any client can get this information, I dont care what URL they are on
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
    next();
});

app.use(bodyParser.json());

// req = request (what you got from the client)
// res = response (what you are sending back to client)

app.get('/lists', function (req, res) { //GETs all lists
    res.json(listOfLists)
})

app.get('/list/:listName', function (req, res) { //GETs a single todo list
    const name = req.params.listName;                
    listOfLists.forEach((list) => {
        if (list.name === name) {
            return res.json(list)
        }
    })
    res.end();  
})

app.get('/list/:listName/:id', function (req, res) { //GETs a single todo item
    const name = req.params.listName;                
    const todoId = req.params.id;          //req.params.id pulls from :id part of url    
    listOfLists.forEach((list) => {
        if (list.name === name) {
            let todos = list.todoList;
            todos.forEach((item) => {
                if (item.id === todoId) {
                    return res.json(item)}
            })
        }
    })
    res.end();  
})

app.post('/list/:listName', function (req, res) { //POSTs a new todo item to a todo list
    const name = req.params.listName;            
    let newTodo =  Object.assign({}, req.body, {id:uuidV1()});  //create newTodo with body of request and give it an ID
    listOfLists.forEach((list) => {
        if (list.name === name) {
            list.todoList = [newTodo, ...list.todoList]}   
    })          
    res.json(newTodo)            //respond with newTodo
})

app.post('/create', function (req, res) { //POSTs a new todo list
    let newList =  req.body;  //create newTodo with body of request and give it an ID
    listOfLists = [newList, ...listOfLists]                                 //update array on server with newTodo
    res.json(newList)                                           //respond with newTodo
})


app.put('/list/:listName', function (req, res) { //PUT updates a list
    const name = req.params.listName;         
    listOfLists.forEach((list) => {
        if (list.name === name) {
            list.name = req.body.name
            res.json(list)            //respond with list
        }   
    })          
})

app.put('/list/:listName/:id', function (req, res) { //PUT updates a todo item
    const name = req.params.listName;                    
    const todoId = req.params.id;                           //req.params.id pulls from :id part of url
    listOfLists.forEach((list) => {
        if (list.name === name) {                           //find correct todoList in LoL
            const oldTodo = list.todoList.find((todo) => todo.id === todoId);  //find todo with matching ID. Create fresh array necessary? no but good practice
            let updatedTodo = Object.assign({}, oldTodo, req.body)     // req.body needed? yes, otherwise has a bunch of random data
            list.todoList = list.todoList.map(item => {                // replace old todoList with new one containing updated todo
                if (item.id !== todoId){ 
                    return item;
                }
                else return updatedTodo;
            });
            res.json(updatedTodo)             
        }
    })
    res.end();                                                
})

app.delete('/list/:listName/:id', function (req, res) { //DELETEs a todo item
    const name = req.params.listName;                    
    const todoId = req.params.id;    
    listOfLists.forEach((list) => {
        if (list.name === name) {
            list.todoList = list.todoList.filter((item) => item.id !== todoId);
        }
    })
    res.end();  
})


app.delete('/list/:listName', function (req, res) {
    const name = req.params.listName;                        
    listOfLists.forEach((list) => {
        if (list.name === name) {   //if clearing list of all completed
            if (req.query.completed === 'true'){
                list.todoList = list.todoList.filter((item) => item.completed !== true);
            }
            else if (req.query.all === 'true'){ //if clearing list of all items
                list.todoList = [];                
            }

            else {  //if deleting list altogether
                listOfLists = listOfLists.filter((list)=> list.name !== name )
            }
            res.end();            
        }
    })
})
  

app.listen(5000) //port


    // setTimeout(function(){
    //     res.json(updatedTodo) 

    // },1000)
