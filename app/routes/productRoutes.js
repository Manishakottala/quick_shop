const express = require("express");
const productController = require("../controllers/productController");
const { requireLogin } = require("../middleware/auth");

const router = express.Router();

router.get("/db_test", productController.testDatabase);
router.get("/products", requireLogin, productController.renderProducts);
router.get("/products/:id", requireLogin, productController.renderProductDetail);

module.exports = router;
