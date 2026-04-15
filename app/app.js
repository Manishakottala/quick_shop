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
  res.locals.userRole = req.session.userRole || "";
  res.locals.userName = req.session.userName || "";
  res.locals.authError = typeof req.query.error === "string" ? req.query.error : "";
  res.locals.authSuccess = typeof req.query.success === "string" ? req.query.success : "";
  next();
});

function getPostLoginRedirect(req) {
  return req.session.userRole === "retailer" ? "/retailer/dashboard" : "/products";
}

function requireLogin(req, res, next) {
  if (req.session.loggedIn) {
    return next();
  }

  return res.redirect("/login?error=Please+log+in+to+continue.");
}

function requireRetailer(req, res, next) {
  if (!req.session.loggedIn) {
    return res.redirect("/login?error=Please+log+in+to+continue.");
  }

  if (req.session.userRole !== "retailer") {
    return res.redirect("/products?error=Retailer+access+required.");
  }

  return next();
}

async function ensureRetailerStore(userId, userName) {
  const stores = await db.query(
    "SELECT store_id FROM stores WHERE retailer_id = ? LIMIT 1",
    [userId]
  );

  if (stores.length > 0) {
    return stores[0].store_id;
  }

  const safeName = typeof userName === "string" && userName.trim() !== ""
    ? userName.trim()
    : "Retailer";

  const insertResult = await db.query(
    `
      INSERT INTO stores (retailer_id, store_name, description)
      VALUES (?, ?, ?)
    `,
    [
      userId,
      `${safeName}'s Store`,
      "Default store created automatically for this retailer account."
    ]
  );

  return insertResult.insertId;
}

async function getRetailerStores(userId) {
  return db.query(
    `
      SELECT store_id, store_name, description, created_at
      FROM stores
      WHERE retailer_id = ?
      ORDER BY created_at DESC, store_id DESC
    `,
    [userId]
  );
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
        return res.redirect(getPostLoginRedirect(req));
    }
    res.render("login");
});

app.get("/register", function(req, res) {
    if (req.session.loggedIn) {
        return res.redirect(getPostLoginRedirect(req));
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
  const normalizedRole = role === "retailer" ? "retailer" : "customer";
  const displayName = typeof name === "string" && name.trim() !== ""
    ? name.trim()
    : typeof username === "string" && username.trim() !== ""
      ? username.trim()
      : "";
  const normalizedPhone = typeof phone === "string" && phone.trim() !== ""
    ? phone.trim()
    : null;

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

    const user = new User(email, displayName, normalizedPhone, normalizedRole);
    await user.addUser(password);

    if (normalizedRole === "retailer") {
      await ensureRetailerStore(user.id, displayName);
    }

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

    const userRecord = await db.query(
      "SELECT name, role FROM users WHERE user_id = ?",
      [uId]
    );

    req.session.uid = uId;
    req.session.loggedIn = true;
    req.session.userName = userRecord[0]?.name || "";
    req.session.userRole = userRecord[0]?.role || "customer";

    if (req.session.userRole === "retailer") {
      await ensureRetailerStore(uId, req.session.userName);
    }

    return res.redirect(getPostLoginRedirect(req));

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

app.get("/retailer/dashboard", requireRetailer, async function(req, res) {
    try {
        await ensureRetailerStore(req.session.uid, req.session.userName);

        const stores = await db.query(
            `
                SELECT
                    s.store_id,
                    s.store_name,
                    s.description,
                    s.created_at,
                    COUNT(DISTINCT p.product_id) AS total_products,
                    COALESCE(SUM(p.stock), 0) AS total_stock,
                    COALESCE(SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END), 0) AS active_products
                FROM stores s
                LEFT JOIN products p ON p.store_id = s.store_id
                WHERE s.retailer_id = ?
                GROUP BY s.store_id, s.store_name, s.description, s.created_at
                ORDER BY s.created_at DESC, s.store_id DESC
            `,
            [req.session.uid]
        );

        const statsResult = await db.query(
            `
                SELECT
                    COUNT(DISTINCT p.product_id) AS product_count,
                    COALESCE(SUM(p.stock), 0) AS stock_units,
                    COUNT(DISTINCT oi.order_id) AS order_count,
                    COALESCE(SUM(oi.quantity * oi.price), 0) AS gross_revenue
                FROM stores s
                LEFT JOIN products p ON p.store_id = s.store_id
                LEFT JOIN order_items oi ON oi.product_id = p.product_id
                WHERE s.retailer_id = ?
            `,
            [req.session.uid]
        );

        const recentProducts = await db.query(
            `
                SELECT
                    p.product_id,
                    p.name,
                    p.price,
                    p.stock,
                    p.status,
                    p.created_at,
                    s.store_name
                FROM stores s
                INNER JOIN products p ON p.store_id = s.store_id
                WHERE s.retailer_id = ?
                ORDER BY p.created_at DESC, p.product_id DESC
                LIMIT 6
            `,
            [req.session.uid]
        );

        res.render("retailer-dashboard", {
            dashboard: statsResult[0] || {
                product_count: 0,
                stock_units: 0,
                order_count: 0,
                gross_revenue: 0
            },
            stores,
            recentProducts
        });
    } catch (err) {
        console.error("Error in /retailer/dashboard:", err);
        res.status(500).send("Database error");
    }
});


// Start server on port 3000
app.listen(3000,function(){
    console.log(`Server running at http://127.0.0.1:3000/`);
});
