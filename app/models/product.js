const db = require("../services/db");

class Product {
  id;
  storeId;
  categoryId;
  name;
  description;
  price;
  stock;
  status;

  constructor(storeId = null, categoryId = null, name = null, description = "", price = null, stock = null, status = "active") {
    this.storeId = storeId;
    this.categoryId = categoryId;
    this.name = name;
    this.description = description;
    this.price = price;
    this.stock = stock;
    this.status = status;
  }

  async getCategories() {
    return db.query(
      "SELECT category_id, name FROM categories ORDER BY name ASC"
    );
  }

  async categoryExists(categoryId) {
    const result = await db.query(
      "SELECT category_id FROM categories WHERE category_id = ? LIMIT 1",
      [categoryId]
    );

    return result.length > 0;
  }

  async getPublicProducts(filters = {}) {
    const search = typeof filters.search === "string" ? filters.search.trim() : "";
    const minPriceValue = typeof filters.minPrice === "string" ? filters.minPrice.trim() : "";
    const maxPriceValue = typeof filters.maxPrice === "string" ? filters.maxPrice.trim() : "";
    const minPrice = minPriceValue === "" ? null : Number(minPriceValue);
    const maxPrice = maxPriceValue === "" ? null : Number(maxPriceValue);

    if ((minPriceValue !== "" && Number.isNaN(minPrice)) || (maxPriceValue !== "" && Number.isNaN(maxPrice))) {
      throw new Error("INVALID_PRICE_FILTER");
    }

    let sql = `
      SELECT
        p.*,
        p.product_id AS id,
        COALESCE(AVG(r.rating), 0) AS average_rating,
        COUNT(DISTINCT r.review_id) AS review_count,
        (
          SELECT pi.image_url
          FROM product_images pi
          WHERE pi.product_id = p.product_id
          ORDER BY pi.image_id ASC
          LIMIT 1
        ) AS image_url
      FROM products p
      LEFT JOIN reviews r ON r.product_id = p.product_id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      sql += " AND (p.name LIKE ? OR p.description LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    if (minPrice !== null) {
      sql += " AND p.price >= ?";
      params.push(minPrice);
    }

    if (maxPrice !== null) {
      sql += " AND p.price <= ?";
      params.push(maxPrice);
    }

    sql += " GROUP BY p.product_id";
    sql += " ORDER BY p.created_at DESC, p.product_id DESC";

    const products = await db.query(sql, params);

    return {
      products,
      filters: {
        search,
        minPrice: minPriceValue,
        maxPrice: maxPriceValue
      }
    };
  }

  async getById(productId) {
    const result = await db.query(
      `
        SELECT
          p.*,
          p.product_id AS id,
          COALESCE(AVG(r.rating), 0) AS average_rating,
          COUNT(DISTINCT r.review_id) AS review_count,
          (
            SELECT pi.image_url
            FROM product_images pi
            WHERE pi.product_id = p.product_id
            ORDER BY pi.image_id ASC
            LIMIT 1
          ) AS image_url
        FROM products p
        LEFT JOIN reviews r ON r.product_id = p.product_id
        WHERE p.product_id = ?
        GROUP BY p.product_id
        LIMIT 1
      `,
      [productId]
    );

    return result[0] || null;
  }

  async getReviews(productId) {
    return db.query(
      `
        SELECT
          r.review_id,
          r.rating,
          r.comment,
          r.created_at,
          u.user_id,
          u.name
        FROM reviews r
        INNER JOIN users u ON u.user_id = r.user_id
        WHERE r.product_id = ?
        ORDER BY r.created_at DESC, r.review_id DESC
      `,
      [productId]
    );
  }

  async getUserReview(productId, userId) {
    const result = await db.query(
      `
        SELECT review_id, rating, comment, created_at
        FROM reviews
        WHERE product_id = ? AND user_id = ?
        LIMIT 1
      `,
      [productId, userId]
    );

    return result[0] || null;
  }

  async userHasPurchasedProduct(productId, userId) {
    const result = await db.query(
      `
        SELECT oi.order_item_id
        FROM order_items oi
        INNER JOIN orders o ON o.order_id = oi.order_id
        WHERE oi.product_id = ? AND o.user_id = ?
        LIMIT 1
      `,
      [productId, userId]
    );

    return result.length > 0;
  }

  async addOrUpdateReview(productId, userId, rating, comment) {
    const existingReview = await this.getUserReview(productId, userId);

    if (existingReview) {
      await db.query(
        `
          UPDATE reviews
          SET rating = ?, comment = ?
          WHERE review_id = ?
        `,
        [rating, comment, existingReview.review_id]
      );

      return existingReview.review_id;
    }

    const result = await db.query(
      `
        INSERT INTO reviews (product_id, user_id, rating, comment)
        VALUES (?, ?, ?, ?)
      `,
      [productId, userId, rating, comment]
    );

    return result.insertId;
  }

  async getRetailerById(userId, productId) {
    const result = await db.query(
      `
        SELECT
          p.*,
          p.product_id AS id,
          (
            SELECT pi.image_url
            FROM product_images pi
            WHERE pi.product_id = p.product_id
            ORDER BY pi.image_id ASC
            LIMIT 1
          ) AS image_url
        FROM products p
        INNER JOIN stores s ON s.store_id = p.store_id
        WHERE s.retailer_id = ? AND p.product_id = ?
        LIMIT 1
      `,
      [userId, productId]
    );

    return result[0] || null;
  }

  async getRetailerProducts(userId, filters = {}) {
    const search = typeof filters.search === "string" ? filters.search.trim() : "";
    const statusFilter = typeof filters.status === "string" ? filters.status.trim() : "";
    const storeFilterValue = typeof filters.store_id === "string" ? filters.store_id.trim() : "";
    const categoryFilterValue = typeof filters.category_id === "string" ? filters.category_id.trim() : "";
    const storeFilter = storeFilterValue === "" ? null : Number(storeFilterValue);
    const categoryFilter = categoryFilterValue === "" ? null : Number(categoryFilterValue);

    let sql = `
      SELECT
        p.product_id,
        p.name,
        p.description,
        p.price,
        p.stock,
        p.status,
        p.category_id,
        p.store_id,
        p.created_at,
        c.name AS category_name,
        s.store_name,
        (
          SELECT pi.image_url
          FROM product_images pi
          WHERE pi.product_id = p.product_id
          ORDER BY pi.image_id ASC
          LIMIT 1
        ) AS image_url
      FROM products p
      INNER JOIN stores s ON s.store_id = p.store_id
      LEFT JOIN categories c ON c.category_id = p.category_id
      WHERE s.retailer_id = ?
    `;
    const params = [userId];

    if (search) {
      sql += " AND (p.name LIKE ? OR p.description LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    if (statusFilter === "active" || statusFilter === "inactive") {
      sql += " AND p.status = ?";
      params.push(statusFilter);
    }

    if (Number.isInteger(storeFilter)) {
      sql += " AND p.store_id = ?";
      params.push(storeFilter);
    }

    if (Number.isInteger(categoryFilter)) {
      sql += " AND p.category_id = ?";
      params.push(categoryFilter);
    }

    sql += " ORDER BY p.created_at DESC, p.product_id DESC";

    return {
      products: await db.query(sql, params),
      filters: {
        search,
        status: statusFilter,
        store_id: storeFilterValue,
        category_id: categoryFilterValue
      }
    };
  }

  async create() {
    const result = await db.query(
      `
        INSERT INTO products (store_id, category_id, name, description, price, stock, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        this.storeId,
        this.categoryId,
        this.name,
        this.description,
        this.price,
        this.stock,
        this.status
      ]
    );

    this.id = result.insertId;
    return this.id;
  }

  async update(productId) {
    this.id = productId;

    return db.query(
      `
        UPDATE products
        SET store_id = ?, category_id = ?, name = ?, description = ?, price = ?, stock = ?, status = ?
        WHERE product_id = ?
      `,
      [
        this.storeId,
        this.categoryId,
        this.name,
        this.description,
        this.price,
        this.stock,
        this.status,
        this.id
      ]
    );
  }

  async getImages(productId) {
    return db.query(
      "SELECT image_id, image_url FROM product_images WHERE product_id = ? ORDER BY image_id ASC",
      [productId]
    );
  }

  async savePrimaryImage(productId, imageUrl) {
    const existingImages = await this.getImages(productId);

    if (existingImages.length > 0) {
      await db.query(
        "UPDATE product_images SET image_url = ? WHERE image_id = ?",
        [imageUrl, existingImages[0].image_id]
      );
      return existingImages[0];
    }

    await db.query(
      "INSERT INTO product_images (product_id, image_url) VALUES (?, ?)",
      [productId, imageUrl]
    );

    return null;
  }

  async delete(productId) {
    await db.query("DELETE FROM product_images WHERE product_id = ?", [productId]);
    return db.query("DELETE FROM products WHERE product_id = ?", [productId]);
  }

  async getRetailerDashboardStats(userId) {
    const result = await db.query(
      `
        SELECT
          COUNT(DISTINCT p.product_id) AS product_count,
          COALESCE(SUM(p.stock), 0) AS stock_units,
          COUNT(DISTINCT oi.order_id) AS order_count,
          COALESCE(SUM(oi.quantity * oi.price), 0) AS gross_revenue
        FROM stores s
        LEFT JOIN products p ON p.store_id = s.store_id
        LEFT JOIN order_items oi ON oi.product_id = p.product_id
        WHERE s.retailer_id = ?
      `,
      [userId]
    );

    return result[0] || {
      product_count: 0,
      stock_units: 0,
      order_count: 0,
      gross_revenue: 0
    };
  }

  async getRecentRetailerProducts(userId) {
    return db.query(
      `
        SELECT
          p.product_id,
          p.name,
          p.price,
          p.stock,
          p.status,
          p.created_at,
          s.store_name
        FROM stores s
        INNER JOIN products p ON p.store_id = s.store_id
        WHERE s.retailer_id = ?
        ORDER BY p.created_at DESC, p.product_id DESC
        LIMIT 6
      `,
      [userId]
    );
  }
}

module.exports = { Product };
