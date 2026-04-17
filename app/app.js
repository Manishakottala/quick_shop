const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const { attachSessionLocals } = require("./middleware/auth");
const pageRoutes = require("./routes/pageRoutes");
const authRoutes = require("./routes/authRoutes");
const profileRoutes = require("./routes/profileRoutes");
const productRoutes = require("./routes/productRoutes");
const retailerRoutes = require("./routes/retailerRoutes");
const cartRoutes = require("./routes/cartRoutes");

const app = express();

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

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

app.use(express.static(path.join(__dirname, "..", "static")));
app.use(express.urlencoded({ extended: true }));

app.set("view engine", "pug");
app.set("views", "./app/views");

app.use(attachSessionLocals);

app.use(pageRoutes);
app.use(authRoutes);
app.use(profileRoutes);
app.use(productRoutes);
app.use(retailerRoutes);
app.use(cartRoutes);

app.listen(3000, function() {
  console.log("Server running at http://127.0.0.1:3000/");
});

module.exports = app;
