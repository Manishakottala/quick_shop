const express = require("express");
const orderController = require("../controllers/orderController");
const { requireCustomer } = require("../middleware/auth");

const router = express.Router();

router.get("/orders", requireCustomer, orderController.renderOrders);

module.exports = router;
