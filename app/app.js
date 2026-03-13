// Import express.js
const express = require("express");
const path = require("path");

// Create express app
var app = express();

// Add static files location
app.use(express.static(path.join(__dirname, "..", "static")));

// Get the functions in the db.js file to use
const db = require('./services/db');

// pug configuration
app.set("view engine", "pug");
app.set("views", "./app/views");

// Create a route for root - /
app.get("/", function(req, res) {
    res.render("home");
});

// Routes for static pages
app.get("/about", function(req, res) {
    res.render("about");
});

app.get("/contact", function(req, res) {
    res.render("contact");
});

// Create a route for testing the db
app.get("/db_test", function(req, res) {
    // Assumes a table called test_table exists in your database
    sql = 'select * from test_table';
    db.query(sql).then(results => {
        console.log(results);
        res.send(results)
    });
});

// Create a route for products
app.get("/products", function(req, res) {
    // Query to get all products
    sql = 'SELECT * FROM products';
    db.query(sql).then(results => {
        console.log(results);
        res.render("products", { products: results });
    }).catch(err => {
        console.error(err);
        res.status(500).send('Database error');
    });
});

// Create a route for /goodbye
// Responds to a 'GET' request
app.get("/goodbye", function(req, res) {
    res.send("Goodbye world!");
});

// Create a dynamic route for /hello/<name>, where name is any value provided by user
// At the end of the URL
// Responds to a 'GET' request
app.get("/hello/:name", function(req, res) {
    // req.params contains any parameters in the request
    // We can examine it in the console for debugging purposes
    console.log(req.params);
    //  Retrieve the 'name' parameter and use it in a dynamically generated page
    res.send("Hello " + req.params.name);
});

// Start server on port 3000
app.listen(3000,function(){
    console.log(`Server running at http://127.0.0.1:3000/`);
});
