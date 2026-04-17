const express = require("express");
const productController = require("../controllers/productController");
const { requireLogin } = require("../middleware/auth");
const { requireCustomer } = require("../middleware/auth");

const router = express.Router();

router.get("/db_test", productController.testDatabase);
router.get("/products", requireLogin, productController.renderProducts);
router.get("/products/:id", requireLogin, productController.renderProductDetail);
router.post("/products/:id/reviews", requireCustomer, productController.submitReview);

module.exports = router;
