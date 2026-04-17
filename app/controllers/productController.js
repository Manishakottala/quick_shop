const db = require("../services/db");
const { Product } = require("../models/product");

async function renderProducts(req, res) {
  try {
    const product = new Product();
    const { products, filters } = await product.getPublicProducts(req.query);

    return res.render("products", {
      products,
      filters
    });
  } catch (err) {
    if (err.message === "INVALID_PRICE_FILTER") {
      return res.status(400).send("Price filters must be valid numbers.");
    }

    console.error("Error in /products:", err);
    return res.status(500).send("Database error");
  }
}

async function renderProductDetail(req, res) {
  const productId = Number(req.params.id);

  if (!Number.isInteger(productId)) {
    return res.status(400).send("Invalid product id.");
  }

  try {
    const product = new Product();
    const selectedProduct = await product.getById(productId);

    if (!selectedProduct) {
      return res.status(404).send("Product not found.");
    }

    return res.render("product-detail", { product: selectedProduct });
  } catch (err) {
    console.error("Error in /products/:id:", err);
    return res.status(500).send("Database error");
  }
}

async function testDatabase(req, res) {
  try {
    const results = await db.query("select * from test_table");
    return res.send(results);
  } catch (err) {
    console.error("Error in /db_test:", err);
    return res.status(500).send("Database error");
  }
}

module.exports = {
  renderProductDetail,
  renderProducts,
  testDatabase
};
