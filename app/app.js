// Import express.js
const express = require("express");
const path = require("path");
const { User } = require("./models/user");



const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const session = require("express-session");

// Create express app
var app = express();

// Parse JSON payloads for API routes
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Session and cookies
app.use(cookieParser());
const oneDay = 1000 * 60 * 60 * 24;
app.use(
  session({
    secret: "secretkeysdfjsflyoifasd",
    saveUninitialized: true,
    resave: false,
    cookie: { maxAge: oneDay },
  })
);


// Add static files location
app.use(express.static(path.join(__dirname, "..", "static")));
app.use(express.urlencoded({ extended: true }));

// Get the functions in the db.js file to use
const db = require('./services/db');

// pug configuration
app.set("view engine", "pug");
app.set("views", "./app/views");


app.use((req, res, next) => {
  res.locals.uid = req.session.uid;
  res.locals.loggedIn = req.session.loggedIn;
  res.locals.authError = typeof req.query.error === "string" ? req.query.error : "";
  res.locals.authSuccess = typeof req.query.success === "string" ? req.query.success : "";
  next();
});

function requireLogin(req, res, next) {
  if (req.session.loggedIn) {
    return next();
  }

  return res.redirect("/login?error=Please+log+in+to+continue.");
}

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
    if (req.session.loggedIn) {
        return res.redirect("/products");
    }
    res.render("login");
});

app.get("/register", function(req, res) {
    if (req.session.loggedIn) {
        return res.redirect("/products");
    }
    res.render("register");
});

// Handle signup
app.post("/register", async (req, res) => {
  const {
    email,
    name,
    username,
    phone = null,
    role = "customer",
    password,
    confirmPassword
  } = req.body;
  const displayName = typeof name === "string" && name.trim() !== ""
    ? name.trim()
    : typeof username === "string" && username.trim() !== ""
      ? username.trim()
      : "";

  if (!email || !displayName || !password || !confirmPassword) {
    return res.redirect("/register?error=All+fields+are+required.");
  }

  if (password !== confirmPassword) {
    return res.redirect("/register?error=Passwords+do+not+match.");
  }

  try {
    const existing = await db.query(
      "SELECT user_id FROM users WHERE email = ?",
      [email]
    );

    if (existing.length > 0) {
      return res.redirect("/register?error=Email+already+exists.");
    }

    const user = new User(email, displayName, phone, role);
    await user.addUser(password);

    return res.redirect("/login?success=Account+created.+Please+log+in.");
  } catch (err) {
    console.error("Error in /register:", err);
    res.redirect("/register?error=Unable+to+create+account.");
  }
});

// Handle login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.redirect("/login?error=Email+and+password+are+required.");
  }

  const user = new User(email);

  try {
    const uId = await user.getIdFromEmail();
    if (!uId) {
      return res.redirect("/login?error=Invalid+email+or+password.");
    }

    user.id = uId;
    const match = await user.authenticate(password);
    if (!match) {
      return res.redirect("/login?error=Invalid+email+or+password.");
    }

    req.session.uid = uId;
    req.session.loggedIn = true;

    return res.redirect("/products");

  } catch (err) {
    console.error("Error in /login:", err);
    res.redirect("/login?error=Unable+to+log+in.");
  }
});


// Handle logout
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error(err);
    res.redirect("/login");
  });
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
app.get("/products", requireLogin, function(req, res) {
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

app.get("/products/:id", requireLogin, function(req, res) {
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
