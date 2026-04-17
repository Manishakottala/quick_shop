const express = require("express");
const retailerController = require("../controllers/retailerController");
const { requireRetailer } = require("../middleware/auth");
const { handleProductImageUpload } = require("../middleware/upload");

const router = express.Router();

router.get("/retailer/dashboard", requireRetailer, retailerController.renderDashboard);
router.get("/retailer/orders", requireRetailer, retailerController.renderRetailerOrders);
router.get("/retailer/products", requireRetailer, retailerController.renderRetailerProducts);
router.post("/retailer/orders/:id/update", requireRetailer, retailerController.updateRetailerOrderStatus);
router.post("/retailer/products", requireRetailer, handleProductImageUpload, retailerController.createRetailerProduct);
router.post("/retailer/products/:id/update", requireRetailer, handleProductImageUpload, retailerController.updateRetailerProduct);
router.post("/retailer/products/:id/delete", requireRetailer, retailerController.deleteRetailerProduct);

module.exports = router;
