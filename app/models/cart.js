const db = require("../services/db");

class Cart {
  id;
  userId;

  constructor(userId) {
    this.userId = userId;
  }

  async ensureCart() {
    const result = await db.query(
      "SELECT cart_id FROM carts WHERE user_id = ? LIMIT 1",
      [this.userId]
    );

    if (result.length > 0) {
      this.id = result[0].cart_id;
      return this.id;
    }

    const insertResult = await db.query(
      "INSERT INTO carts (user_id) VALUES (?)",
      [this.userId]
    );

    this.id = insertResult.insertId;
    return this.id;
  }

  async addItem(productId, quantity = 1) {
    const cartId = await this.ensureCart();
    const existingItem = await db.query(
      "SELECT cart_item_id FROM cart_items WHERE cart_id = ? AND product_id = ? LIMIT 1",
      [cartId, productId]
    );

    if (existingItem.length > 0) {
      await db.query(
        "UPDATE cart_items SET quantity = quantity + ? WHERE cart_item_id = ?",
        [quantity, existingItem[0].cart_item_id]
      );
      return existingItem[0].cart_item_id;
    }

    const insertResult = await db.query(
      "INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)",
      [cartId, productId, quantity]
    );

    return insertResult.insertId;
  }

  async getItems() {
    const cartId = await this.ensureCart();

    return db.query(
      `
        SELECT
          ci.cart_item_id,
          ci.quantity,
          p.product_id,
          p.name,
          p.description,
          p.price,
          p.stock,
          (ci.quantity * p.price) AS line_total,
          (
            SELECT pi.image_url
            FROM product_images pi
            WHERE pi.product_id = p.product_id
            ORDER BY pi.image_id ASC
            LIMIT 1
          ) AS image_url
        FROM cart_items ci
        INNER JOIN products p ON p.product_id = ci.product_id
        WHERE ci.cart_id = ?
        ORDER BY ci.cart_item_id DESC
      `,
      [cartId]
    );
  }

  async updateItemQuantity(cartItemId, quantity) {
    const cartId = await this.ensureCart();

    if (quantity <= 0) {
      return this.removeItem(cartItemId);
    }

    return db.query(
      "UPDATE cart_items SET quantity = ? WHERE cart_item_id = ? AND cart_id = ?",
      [quantity, cartItemId, cartId]
    );
  }

  async removeItem(cartItemId) {
    const cartId = await this.ensureCart();

    return db.query(
      "DELETE FROM cart_items WHERE cart_item_id = ? AND cart_id = ?",
      [cartItemId, cartId]
    );
  }
}

module.exports = { Cart };
