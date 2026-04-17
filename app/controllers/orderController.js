const { Order } = require("../models/order");

async function renderOrders(req, res) {
  try {
    const order = new Order(req.session.uid);
    const orders = await order.getUserOrders();

    for (const currentOrder of orders) {
      currentOrder.items = await order.getOrderItems(currentOrder.order_id);
    }

    return res.render("orders", { orders });
  } catch (err) {
    console.error("Error in /orders:", err);
    return res.status(500).send("Database error");
  }
}

module.exports = {
  renderOrders
};
