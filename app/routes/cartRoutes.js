const express = require("express");
const cartController = require("../controllers/cartController");
const { requireCustomer } = require("../middleware/auth");

const router = express.Router();

router.get("/cart", requireCustomer, cartController.renderCart);
router.post("/cart/add/:id", requireCustomer, cartController.addToCart);
router.post("/cart/item/:id/update", requireCustomer, cartController.updateCartItem);
router.post("/cart/item/:id/delete", requireCustomer, cartController.removeCartItem);

module.exports = router;
