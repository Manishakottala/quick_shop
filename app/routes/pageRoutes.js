const express = require("express");
const pageController = require("../controllers/pageController");

const router = express.Router();

router.get("/", pageController.renderHome);
router.get("/about", pageController.renderAbout);
router.get("/contact", pageController.renderContact);

module.exports = router;
