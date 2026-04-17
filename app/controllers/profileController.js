const db = require("../services/db");
const { Store } = require("../models/store");

async function renderProfile(req, res) {
  try {
    const users = await db.query(
      `
        SELECT user_id, name, email, phone, role, created_at
        FROM users
        WHERE user_id = ?
        LIMIT 1
      `,
      [req.session.uid]
    );

    if (!users.length) {
      return res.redirect("/login?error=Account+not+found.");
    }

    let stores = [];

    if (users[0].role === "retailer") {
      const store = new Store(req.session.uid);
      stores = await store.getRetailerStoreSummaries();
    }

    return res.render("profile", {
      profile: users[0],
      stores
    });
  } catch (err) {
    console.error("Error in /profile:", err);
    return res.status(500).send("Database error");
  }
}

async function updateProfile(req, res) {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
  const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : "";

  if (!name || !email) {
    return res.redirect("/profile?error=Name+and+email+are+required.");
  }

  try {
    const existingUser = await db.query(
      "SELECT user_id FROM users WHERE email = ? AND user_id <> ? LIMIT 1",
      [email, req.session.uid]
    );

    if (existingUser.length) {
      return res.redirect("/profile?error=Email+already+exists.");
    }

    await db.query(
      `
        UPDATE users
        SET name = ?, email = ?, phone = ?
        WHERE user_id = ?
      `,
      [name, email, phone || null, req.session.uid]
    );

    req.session.userName = name;

    return res.redirect("/profile?success=Profile+updated+successfully.");
  } catch (err) {
    console.error("Error updating /profile:", err);
    return res.redirect("/profile?error=Unable+to+update+profile.");
  }
}

async function updateStore(req, res) {
  const storeId = Number(req.params.id);
  const storeName = typeof req.body.store_name === "string" ? req.body.store_name.trim() : "";
  const description = typeof req.body.description === "string" ? req.body.description.trim() : "";

  if (!storeName) {
    return res.redirect("/profile?error=Store+name+required");
  }

  try {
    const store = new Store(req.session.uid);
    await store.updateStore(storeId, storeName, description);
    return res.redirect("/profile?success=Store+updated");
  } catch (err) {
    console.error("Error updating store:", err);
    return res.redirect("/profile?error=Update+failed");
  }
}

module.exports = {
  renderProfile,
  updateProfile,
  updateStore
};
