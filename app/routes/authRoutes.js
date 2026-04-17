const express = require("express");
const authController = require("../controllers/authController");
const { redirectIfLoggedIn } = require("../middleware/auth");

const router = express.Router();

router.get("/login", redirectIfLoggedIn, authController.renderLogin);
router.get("/register", redirectIfLoggedIn, authController.renderRegister);
router.post("/register", authController.register);
router.post("/login", authController.login);
router.get("/logout", authController.logout);

module.exports = router;
