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

    const reviews = await product.getReviews(productId);
    const userReview = req.session.uid
      ? await product.getUserReview(productId, req.session.uid)
      : null;
    const canReview = req.session.userRole !== "retailer" && req.session.uid
      ? await product.userHasPurchasedProduct(productId, req.session.uid)
      : false;

    return res.render("product-detail", {
      product: selectedProduct,
      reviews,
      userReview,
      canReview
    });
  } catch (err) {
    console.error("Error in /products/:id:", err);
    return res.status(500).send("Database error");
  }
}

async function submitReview(req, res) {
  const productId = Number(req.params.id);
  const rating = Number(req.body.rating);
  const comment = typeof req.body.comment === "string" ? req.body.comment.trim() : "";

  if (!Number.isInteger(productId) || productId <= 0) {
    return res.redirect("/products?error=Invalid+product+selected.");
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.redirect(`/products/${productId}?error=Select+a+rating+from+1+to+5.`);
  }

  try {
    const product = new Product();
    const selectedProduct = await product.getById(productId);

    if (!selectedProduct) {
      return res.redirect("/products?error=Product+not+found.");
    }

    if (req.session.userRole === "retailer") {
      return res.redirect(`/products/${productId}?error=Retailers+cannot+review+products.`);
    }

    const canReview = await product.userHasPurchasedProduct(productId, req.session.uid);
    if (!canReview) {
      return res.redirect(`/products/${productId}?error=You+can+review+only+products+you+have+purchased.`);
    }

    await product.addOrUpdateReview(productId, req.session.uid, rating, comment || null);
    return res.redirect(`/products/${productId}?success=Review+saved+successfully.`);
  } catch (err) {
    console.error("Error submitting review:", err);
    return res.redirect(`/products/${productId}?error=Unable+to+save+review.`);
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
  submitReview,
  testDatabase
};
