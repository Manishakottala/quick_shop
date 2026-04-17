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

  async getUserOrders() {
    return db.query(
      `
        SELECT
          o.order_id,
          o.total_amount,
          o.created_at,
          os.name AS status_name,
          a.street,
          a.city,
          a.state,
          a.postal_code,
          a.country,
          COUNT(oi.order_item_id) AS item_count
        FROM orders o
        LEFT JOIN order_status os ON os.order_status_id = o.order_status_id
        LEFT JOIN addresses a ON a.address_id = o.address_id
        LEFT JOIN order_items oi ON oi.order_id = o.order_id
        WHERE o.user_id = ?
        GROUP BY
          o.order_id,
          o.total_amount,
          o.created_at,
          os.name,
          a.street,
          a.city,
          a.state,
          a.postal_code,
          a.country
        ORDER BY o.created_at DESC, o.order_id DESC
      `,
      [this.userId]
    );
  }

  async getOrderItems(orderId) {
    return db.query(
      `
        SELECT
          oi.order_item_id,
          oi.quantity,
          oi.price,
          p.product_id,
          p.name,
          (
            SELECT pi.image_url
            FROM product_images pi
            WHERE pi.product_id = p.product_id
            ORDER BY pi.image_id ASC
            LIMIT 1
          ) AS image_url
        FROM order_items oi
        INNER JOIN orders o ON o.order_id = oi.order_id
        INNER JOIN products p ON p.product_id = oi.product_id
        WHERE o.user_id = ? AND oi.order_id = ?
        ORDER BY oi.order_item_id ASC
      `,
      [this.userId, orderId]
    );
  }

  async ensureRetailerStatuses() {
    const existingStatuses = await db.query(
      "SELECT order_status_id, name FROM order_status ORDER BY order_status_id ASC"
    );

    if (existingStatuses.length > 0) {
      return existingStatuses;
    }

    const defaultStatuses = ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"];

    for (const statusName of defaultStatuses) {
      await db.query(
        "INSERT INTO order_status (name) VALUES (?)",
        [statusName]
      );
    }

    return db.query(
      "SELECT order_status_id, name FROM order_status ORDER BY order_status_id ASC"
    );
  }

  async getRetailerOrders(retailerId) {
    return db.query(
      `
        SELECT
          o.order_id,
          o.created_at,
          o.total_amount,
          o.order_status_id,
          os.name AS status_name,
          u.name AS customer_name,
          u.email AS customer_email,
          a.street,
          a.city,
          a.state,
          a.postal_code,
          a.country,
          COUNT(DISTINCT oi.order_item_id) AS item_count,
          COALESCE(SUM(oi.quantity), 0) AS total_units,
          COALESCE(SUM(oi.quantity * oi.price), 0) AS retailer_total
        FROM orders o
        INNER JOIN users u ON u.user_id = o.user_id
        LEFT JOIN addresses a ON a.address_id = o.address_id
        LEFT JOIN order_status os ON os.order_status_id = o.order_status_id
        INNER JOIN order_items oi ON oi.order_id = o.order_id
        INNER JOIN products p ON p.product_id = oi.product_id
        INNER JOIN stores s ON s.store_id = p.store_id
        WHERE s.retailer_id = ?
        GROUP BY
          o.order_id,
          o.created_at,
          o.total_amount,
          o.order_status_id,
          os.name,
          u.name,
          u.email,
          a.street,
          a.city,
          a.state,
          a.postal_code,
          a.country
        ORDER BY o.created_at DESC, o.order_id DESC
      `,
      [retailerId]
    );
  }

  async getRetailerOrderItems(retailerId, orderId) {
    return db.query(
      `
        SELECT
          oi.order_item_id,
          oi.quantity,
          oi.price,
          p.product_id,
          p.name,
          s.store_name,
          (
            SELECT pi.image_url
            FROM product_images pi
            WHERE pi.product_id = p.product_id
            ORDER BY pi.image_id ASC
            LIMIT 1
          ) AS image_url
        FROM order_items oi
        INNER JOIN products p ON p.product_id = oi.product_id
        INNER JOIN stores s ON s.store_id = p.store_id
        WHERE oi.order_id = ? AND s.retailer_id = ?
        ORDER BY oi.order_item_id ASC
      `,
      [orderId, retailerId]
    );
  }

  async retailerCanManageOrder(retailerId, orderId) {
    const result = await db.query(
      `
        SELECT o.order_id
        FROM orders o
        INNER JOIN order_items oi ON oi.order_id = o.order_id
        INNER JOIN products p ON p.product_id = oi.product_id
        INNER JOIN stores s ON s.store_id = p.store_id
        WHERE o.order_id = ? AND s.retailer_id = ?
        LIMIT 1
      `,
      [orderId, retailerId]
    );

    return result.length > 0;
  }

  async updateOrderStatus(orderId, statusId) {
    return db.query(
      "UPDATE orders SET order_status_id = ? WHERE order_id = ?",
      [statusId, orderId]
    );
  }
}

module.exports = { Order };
