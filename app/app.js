// Import express.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { User } = require("./models/user");



const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const session = require("express-session");

// Create express app
var app = express();

const uploadsDir = path.join(__dirname, "..", "static", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const productImageStorage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function(req, file, cb) {
    const extension = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, `product-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
  }
});

const productImageUpload = multer({
  storage: productImageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: function(req, file, cb) {
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

    if (allowedMimeTypes.includes(file.mimetype)) {
      return cb(null, true);
    }

    return cb(new Error("Only image files are allowed."));
  }
});

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

async function getRetailerProductById(userId, productId) {
  const results = await db.query(
    `
      SELECT
        p.*,
        p.product_id AS id,
        (
          SELECT pi.image_url
          FROM product_images pi
          WHERE pi.product_id = p.product_id
          ORDER BY pi.image_id ASC
          LIMIT 1
        ) AS image_url
      FROM products p
      INNER JOIN stores s ON s.store_id = p.store_id
      WHERE s.retailer_id = ? AND p.product_id = ?
      LIMIT 1
    `,
    [userId, productId]
  );

  return results[0] || null;
}

function handleProductImageUpload(req, res, next) {
  productImageUpload.single("image")(req, res, function(err) {
    if (!err) {
      return next();
    }

    const productId = Number(req.params.id);
    const redirectTarget = Number.isInteger(productId) && productId > 0
      ? `/retailer/products?edit=${productId}&error=Upload+a+valid+image+under+5MB.`
      : "/retailer/products?create=1&error=Upload+a+valid+image+under+5MB.";

    return res.redirect(redirectTarget);
  });
}

function getUploadedImagePath(file) {
  if (!file || !file.filename) {
    return "";
  }

  return `/uploads/${file.filename}`;
}

async function deleteUploadedImage(imageUrl) {
  if (typeof imageUrl !== "string" || !imageUrl.startsWith("/uploads/")) {
    return;
  }

  const fileName = path.basename(imageUrl);
  const filePath = path.join(uploadsDir, fileName);

  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error("Error deleting uploaded image:", err);
    }
  }
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

app.get("/retailer/products", requireRetailer, async function(req, res) {
    try {
        await ensureRetailerStore(req.session.uid, req.session.userName);

        const editProductId = Number(req.query.edit);
        const createMode = req.query.create === "1";
        const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
        const statusFilter = typeof req.query.status === "string" ? req.query.status.trim() : "";
        const storeFilterValue = typeof req.query.store_id === "string" ? req.query.store_id.trim() : "";
        const categoryFilterValue = typeof req.query.category_id === "string" ? req.query.category_id.trim() : "";
        const storeFilter = storeFilterValue === "" ? null : Number(storeFilterValue);
        const categoryFilter = categoryFilterValue === "" ? null : Number(categoryFilterValue);

        const stores = await getRetailerStores(req.session.uid);
        const categories = await db.query(
            "SELECT category_id, name FROM categories ORDER BY name ASC"
        );

        let sql = `
            SELECT
                p.product_id,
                p.name,
                p.description,
                p.price,
                p.stock,
                p.status,
                p.category_id,
                p.store_id,
                p.created_at,
                c.name AS category_name,
                s.store_name,
                (
                    SELECT pi.image_url
                    FROM product_images pi
                    WHERE pi.product_id = p.product_id
                    ORDER BY pi.image_id ASC
                    LIMIT 1
                ) AS image_url
            FROM products p
            INNER JOIN stores s ON s.store_id = p.store_id
            LEFT JOIN categories c ON c.category_id = p.category_id
            WHERE s.retailer_id = ?
        `;
        const params = [req.session.uid];

        if (search) {
            sql += " AND (p.name LIKE ? OR p.description LIKE ?)";
            params.push(`%${search}%`, `%${search}%`);
        }

        if (statusFilter === "active" || statusFilter === "inactive") {
            sql += " AND p.status = ?";
            params.push(statusFilter);
        }

        if (Number.isInteger(storeFilter)) {
            sql += " AND p.store_id = ?";
            params.push(storeFilter);
        }

        if (Number.isInteger(categoryFilter)) {
            sql += " AND p.category_id = ?";
            params.push(categoryFilter);
        }

        sql += " ORDER BY p.created_at DESC, p.product_id DESC";

        const products = await db.query(sql, params);
        let editProduct = null;

        if (Number.isInteger(editProductId) && editProductId > 0) {
            editProduct = await getRetailerProductById(req.session.uid, editProductId);
        }

        res.render("retailer-products", {
            stores,
            categories,
            products,
            editProduct,
            createMode,
            filters: {
                search,
                status: statusFilter,
                store_id: storeFilterValue,
                category_id: categoryFilterValue
            }
        });
    } catch (err) {
        console.error("Error in /retailer/products:", err);
        res.status(500).send("Database error");
    }
});

app.post("/retailer/products", requireRetailer, handleProductImageUpload, async function(req, res) {
    const {
        name,
        description = "",
        price,
        stock,
        status = "active",
        category_id,
        store_id
    } = req.body;

    const normalizedName = typeof name === "string" ? name.trim() : "";
    const normalizedDescription = typeof description === "string" ? description.trim() : "";
    const uploadedImagePath = getUploadedImagePath(req.file);
    const normalizedStatus = status === "inactive" ? "inactive" : "active";
    const priceValue = Number(price);
    const stockValue = Number(stock);
    const categoryId = Number(category_id);
    const storeId = Number(store_id);

    if (!normalizedName || Number.isNaN(priceValue) || Number.isNaN(stockValue) || !Number.isInteger(categoryId) || !Number.isInteger(storeId)) {
        await deleteUploadedImage(uploadedImagePath);
        return res.redirect("/retailer/products?error=Please+fill+all+product+fields+correctly.");
    }

    try {
        const ownedStore = await db.query(
            "SELECT store_id FROM stores WHERE store_id = ? AND retailer_id = ? LIMIT 1",
            [storeId, req.session.uid]
        );

        if (!ownedStore.length) {
            await deleteUploadedImage(uploadedImagePath);
            return res.redirect("/retailer/products?error=Invalid+store+selection.");
        }

        const categoryExists = await db.query(
            "SELECT category_id FROM categories WHERE category_id = ? LIMIT 1",
            [categoryId]
        );

        if (!categoryExists.length) {
            await deleteUploadedImage(uploadedImagePath);
            return res.redirect("/retailer/products?error=Select+a+valid+category.");
        }

        const result = await db.query(
            `
                INSERT INTO products (store_id, category_id, name, description, price, stock, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [storeId, categoryId, normalizedName, normalizedDescription, priceValue, stockValue, normalizedStatus]
        );

        if (uploadedImagePath) {
            await db.query(
                "INSERT INTO product_images (product_id, image_url) VALUES (?, ?)",
                [result.insertId, uploadedImagePath]
            );
        }

        return res.redirect("/retailer/products?success=Product+created+successfully.");
    } catch (err) {
        console.error("Error creating retailer product:", err);
        await deleteUploadedImage(uploadedImagePath);
        res.redirect("/retailer/products?error=Unable+to+create+product.");
    }
});

app.post("/retailer/products/:id/update", requireRetailer, handleProductImageUpload, async function(req, res) {
    const productId = Number(req.params.id);
    const {
        name,
        description = "",
        price,
        stock,
        status = "active",
        category_id,
        store_id
    } = req.body;

    if (!Number.isInteger(productId) || productId <= 0) {
        return res.redirect("/retailer/products?error=Invalid+product+selected.");
    }

    const normalizedName = typeof name === "string" ? name.trim() : "";
    const normalizedDescription = typeof description === "string" ? description.trim() : "";
    const uploadedImagePath = getUploadedImagePath(req.file);
    const normalizedStatus = status === "inactive" ? "inactive" : "active";
    const priceValue = Number(price);
    const stockValue = Number(stock);
    const categoryId = Number(category_id);
    const storeId = Number(store_id);

    if (!normalizedName || Number.isNaN(priceValue) || Number.isNaN(stockValue) || !Number.isInteger(categoryId) || !Number.isInteger(storeId)) {
        await deleteUploadedImage(uploadedImagePath);
        return res.redirect(`/retailer/products?edit=${productId}&error=Please+fill+all+product+fields+correctly.`);
    }

    try {
        const existingProduct = await getRetailerProductById(req.session.uid, productId);
        if (!existingProduct) {
            await deleteUploadedImage(uploadedImagePath);
            return res.redirect("/retailer/products?error=Product+not+found.");
        }

        const ownedStore = await db.query(
            "SELECT store_id FROM stores WHERE store_id = ? AND retailer_id = ? LIMIT 1",
            [storeId, req.session.uid]
        );

        if (!ownedStore.length) {
            await deleteUploadedImage(uploadedImagePath);
            return res.redirect(`/retailer/products?edit=${productId}&error=Invalid+store+selection.`);
        }

        const categoryExists = await db.query(
            "SELECT category_id FROM categories WHERE category_id = ? LIMIT 1",
            [categoryId]
        );

        if (!categoryExists.length) {
            await deleteUploadedImage(uploadedImagePath);
            return res.redirect(`/retailer/products?edit=${productId}&error=Select+a+valid+category.`);
        }

        await db.query(
            `
                UPDATE products
                SET store_id = ?, category_id = ?, name = ?, description = ?, price = ?, stock = ?, status = ?
                WHERE product_id = ?
            `,
            [storeId, categoryId, normalizedName, normalizedDescription, priceValue, stockValue, normalizedStatus, productId]
        );

        const existingImage = await db.query(
            "SELECT image_id, image_url FROM product_images WHERE product_id = ? ORDER BY image_id ASC LIMIT 1",
            [productId]
        );

        if (uploadedImagePath) {
            if (existingImage.length) {
                const previousImageUrl = existingImage[0].image_url;
                await db.query(
                    "UPDATE product_images SET image_url = ? WHERE image_id = ?",
                    [uploadedImagePath, existingImage[0].image_id]
                );
                await deleteUploadedImage(previousImageUrl);
            } else {
                await db.query(
                    "INSERT INTO product_images (product_id, image_url) VALUES (?, ?)",
                    [productId, uploadedImagePath]
                );
            }
        }

        return res.redirect("/retailer/products?success=Product+updated+successfully.");
    } catch (err) {
        console.error("Error updating retailer product:", err);
        await deleteUploadedImage(uploadedImagePath);
        res.redirect(`/retailer/products?edit=${productId}&error=Unable+to+update+product.`);
    }
});

app.post("/retailer/products/:id/delete", requireRetailer, async function(req, res) {
    const productId = Number(req.params.id);

    if (!Number.isInteger(productId) || productId <= 0) {
        return res.redirect("/retailer/products?error=Invalid+product+selected.");
    }

    try {
        const existingProduct = await getRetailerProductById(req.session.uid, productId);
        if (!existingProduct) {
            return res.redirect("/retailer/products?error=Product+not+found.");
        }

        const productImages = await db.query(
            "SELECT image_url FROM product_images WHERE product_id = ?",
            [productId]
        );

        await db.query("DELETE FROM product_images WHERE product_id = ?", [productId]);
        await db.query("DELETE FROM products WHERE product_id = ?", [productId]);

        for (const image of productImages) {
            await deleteUploadedImage(image.image_url);
        }

        return res.redirect("/retailer/products?success=Product+deleted+successfully.");
    } catch (err) {
        console.error("Error deleting retailer product:", err);
        res.redirect("/retailer/products?error=Unable+to+delete+product.+Remove+related+orders+first.");
    }
});


// Start server on port 3000
app.listen(3000,function(){
    console.log(`Server running at http://127.0.0.1:3000/`);
});
