const db = require("../services/db");

class Store {
  id;
  retailerId;
  name;
  description;

  constructor(retailerId, name = null, description = null) {
    this.retailerId = retailerId;
    this.name = name;
    this.description = description;
  }

  async ensureDefaultStore(userName) {
    const stores = await db.query(
      "SELECT store_id FROM stores WHERE retailer_id = ? LIMIT 1",
      [this.retailerId]
    );

    if (stores.length > 0) {
      this.id = stores[0].store_id;
      return this.id;
    }

    const safeName = typeof userName === "string" && userName.trim() !== ""
      ? userName.trim()
      : "Retailer";

    const result = await db.query(
      `
        INSERT INTO stores (retailer_id, store_name, description)
        VALUES (?, ?, ?)
      `,
      [
        this.retailerId,
        `${safeName}'s Store`,
        "Default store created automatically for this retailer account."
      ]
    );

    this.id = result.insertId;
    return this.id;
  }

  async getRetailerStores() {
    return db.query(
      `
        SELECT store_id, store_name, description, created_at
        FROM stores
        WHERE retailer_id = ?
        ORDER BY created_at DESC, store_id DESC
      `,
      [this.retailerId]
    );
  }

  async getRetailerStoreSummaries() {
    return db.query(
      `
        SELECT
          s.store_id,
          s.store_name,
          s.description,
          s.created_at,
          COUNT(DISTINCT p.product_id) AS total_products,
          COALESCE(SUM(p.stock), 0) AS total_stock
        FROM stores s
        LEFT JOIN products p ON p.store_id = s.store_id
        WHERE s.retailer_id = ?
        GROUP BY s.store_id, s.store_name, s.description, s.created_at
        ORDER BY s.created_at DESC, s.store_id DESC
      `,
      [this.retailerId]
    );
  }

  async getDashboardStores() {
    return db.query(
      `
        SELECT
          s.store_id,
          s.store_name,
          s.description,
          s.created_at,
          COUNT(DISTINCT p.product_id) AS total_products,
          COALESCE(SUM(p.stock), 0) AS total_stock,
          COALESCE(SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END), 0) AS active_products
        FROM stores s
        LEFT JOIN products p ON p.store_id = s.store_id
        WHERE s.retailer_id = ?
        GROUP BY s.store_id, s.store_name, s.description, s.created_at
        ORDER BY s.created_at DESC, s.store_id DESC
      `,
      [this.retailerId]
    );
  }

  async getOwnedStoreById(storeId) {
    const result = await db.query(
      "SELECT store_id FROM stores WHERE store_id = ? AND retailer_id = ? LIMIT 1",
      [storeId, this.retailerId]
    );

    return result[0] || null;
  }

  async updateStore(storeId, storeName, description) {
    return db.query(
      `
        UPDATE stores
        SET store_name = ?, description = ?
        WHERE store_id = ? AND retailer_id = ?
      `,
      [storeName, description || null, storeId, this.retailerId]
    );
  }
}

module.exports = { Store };
