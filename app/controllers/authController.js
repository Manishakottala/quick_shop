const db = require("../services/db");
const { User } = require("../models/user");
const { Store } = require("../models/store");
const { getPostLoginRedirect } = require("../middleware/auth");

function renderLogin(req, res) {
  res.render("login");
}

function renderRegister(req, res) {
  res.render("register");
}

async function register(req, res) {
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
      const store = new Store(user.id);
      await store.ensureDefaultStore(displayName);
    }

    return res.redirect("/login?success=Account+created.+Please+log+in.");
  } catch (err) {
    console.error("Error in /register:", err);
    return res.redirect("/register?error=Unable+to+create+account.");
  }
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.redirect("/login?error=Email+and+password+are+required.");
  }

  const user = new User(email);

  try {
    const userId = await user.getIdFromEmail();
    if (!userId) {
      return res.redirect("/login?error=Invalid+email+or+password.");
    }

    user.id = userId;
    const match = await user.authenticate(password);
    if (!match) {
      return res.redirect("/login?error=Invalid+email+or+password.");
    }

    const userRecord = await db.query(
      "SELECT name, role FROM users WHERE user_id = ?",
      [userId]
    );

    req.session.uid = userId;
    req.session.loggedIn = true;
    req.session.userName = userRecord[0]?.name || "";
    req.session.userRole = userRecord[0]?.role || "customer";

    if (req.session.userRole === "retailer") {
      const store = new Store(userId);
      await store.ensureDefaultStore(req.session.userName);
    }

    return res.redirect(getPostLoginRedirect(req));
  } catch (err) {
    console.error("Error in /login:", err);
    return res.redirect("/login?error=Unable+to+log+in.");
  }
}

function logout(req, res) {
  req.session.destroy(function(err) {
    if (err) {
      console.error(err);
    }

    res.redirect("/login");
  });
}

module.exports = {
  login,
  logout,
  register,
  renderLogin,
  renderRegister
};
