const express = require("express");
const profileController = require("../controllers/profileController");
const { requireLogin, requireRetailer } = require("../middleware/auth");

const router = express.Router();

router.get("/profile", requireLogin, profileController.renderProfile);
router.post("/profile", requireLogin, profileController.updateProfile);
router.post("/store/:id/update", requireRetailer, profileController.updateStore);

module.exports = router;
