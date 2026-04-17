const db = require("../services/db");

class Order {
  userId;

  constructor(userId) {
    this.userId = userId;
  }

  async ensurePendingStatus(connection) {
    const [existing] = await connection.execute(
      "SELECT order_status_id FROM order_status ORDER BY order_status_id ASC LIMIT 1"
    );

    if (existing.length > 0) {
      return existing[0].order_status_id;
    }

    const [result] = await connection.execute(
      "INSERT INTO order_status (name) VALUES (?)",
      ["Pending"]
    );

    return result.insertId;
  }

  async placeOrder(address, cartItems) {
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      throw new Error("EMPTY_CART");
    }

    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const [addressResult] = await connection.execute(
        `
          INSERT INTO addresses (user_id, street, city, state, postal_code, country)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          this.userId,
          address.street,
          address.city,
          address.state,
          address.postalCode,
          address.country
        ]
      );

      const orderStatusId = await this.ensurePendingStatus(connection);
      const totalAmount = cartItems.reduce(function(total, item) {
        return total + Number(item.price) * Number(item.quantity);
      }, 0);

      const [orderResult] = await connection.execute(
        `
          INSERT INTO orders (user_id, address_id, total_amount, order_status_id)
          VALUES (?, ?, ?, ?)
        `,
        [this.userId, addressResult.insertId, totalAmount, orderStatusId]
      );

      for (const item of cartItems) {
        if (Number(item.stock) < Number(item.quantity)) {
          throw new Error("INSUFFICIENT_STOCK");
        }

        await connection.execute(
          `
            INSERT INTO order_items (order_id, product_id, quantity, price)
            VALUES (?, ?, ?, ?)
          `,
          [orderResult.insertId, item.product_id, item.quantity, item.price]
        );

        await connection.execute(
          "UPDATE products SET stock = stock - ? WHERE product_id = ?",
          [item.quantity, item.product_id]
        );
      }

      const [cartRows] = await connection.execute(
        "SELECT cart_id FROM carts WHERE user_id = ? LIMIT 1",
        [this.userId]
      );

      if (cartRows.length > 0) {
        await connection.execute(
          "DELETE FROM cart_items WHERE cart_id = ?",
          [cartRows[0].cart_id]
        );
      }

      await connection.commit();
      return orderResult.insertId;
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }
}

module.exports = { Order };
