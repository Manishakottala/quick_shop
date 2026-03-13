// Import express.js
const express = require("express");
const path = require("path");

// Create express app
var app = express();

// Add static files location
app.use(express.static(path.join(__dirname, "..", "static")));
app.use(express.urlencoded({ extended: true }));

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

app.get("/login", function(req, res) {
    res.render("login");
});

app.get("/register", function(req, res) {
    res.render("register");
});

app.post("/login", function(req, res) {
    res.redirect("/products");
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
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const minPriceValue = typeof req.query.minPrice === "string" ? req.query.minPrice.trim() : "";
    const maxPriceValue = typeof req.query.maxPrice === "string" ? req.query.maxPrice.trim() : "";
    const minPrice = minPriceValue === "" ? null : Number(minPriceValue);
    const maxPrice = maxPriceValue === "" ? null : Number(maxPriceValue);

    if ((minPriceValue !== "" && Number.isNaN(minPrice)) || (maxPriceValue !== "" && Number.isNaN(maxPrice))) {
        return res.status(400).send("Price filters must be valid numbers.");
    }

    let sql = "SELECT * FROM products WHERE 1=1";
    const params = [];

    if (search) {
        sql += " AND (name LIKE ? OR description LIKE ?)";
        params.push(`%${search}%`, `%${search}%`);
    }

    if (minPrice !== null) {
        sql += " AND price >= ?";
        params.push(minPrice);
    }

    if (maxPrice !== null) {
        sql += " AND price <= ?";
        params.push(maxPrice);
    }

    sql += " ORDER BY created_at DESC, id DESC";

    db.query(sql, params).then(results => {
        res.render("products", {
            products: results,
            filters: {
                search,
                minPrice: minPriceValue,
                maxPrice: maxPriceValue
            }
        });
    }).catch(err => {
        console.error(err);
        res.status(500).send("Database error");
    });
});

app.get("/products/:id", function(req, res) {
    const productId = Number(req.params.id);

    if (!Number.isInteger(productId)) {
        return res.status(400).send("Invalid product id.");
    }

    db.query("SELECT * FROM products WHERE id = ?", [productId]).then(results => {
        if (!results.length) {
            return res.status(404).send("Product not found.");
        }

        res.render("product-detail", { product: results[0] });
    }).catch(err => {
        console.error(err);
        res.status(500).send("Database error");
    });
});


// Start server on port 3000
app.listen(3000,function(){
    console.log(`Server running at http://127.0.0.1:3000/`);
});
