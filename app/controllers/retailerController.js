const { Product } = require("../models/product");
const { Store } = require("../models/store");
const { deleteUploadedImage, getUploadedImagePath } = require("../middleware/upload");

async function renderDashboard(req, res) {
  try {
    const store = new Store(req.session.uid);
    await store.ensureDefaultStore(req.session.userName);

    const product = new Product();
    const stores = await store.getDashboardStores();
    const dashboard = await product.getRetailerDashboardStats(req.session.uid);
    const recentProducts = await product.getRecentRetailerProducts(req.session.uid);

    return res.render("retailer-dashboard", {
      dashboard,
      stores,
      recentProducts
    });
  } catch (err) {
    console.error("Error in /retailer/dashboard:", err);
    return res.status(500).send("Database error");
  }
}

async function renderRetailerProducts(req, res) {
  try {
    const store = new Store(req.session.uid);
    await store.ensureDefaultStore(req.session.userName);

    const product = new Product();
    const editProductId = Number(req.query.edit);
    const createMode = req.query.create === "1";
    const stores = await store.getRetailerStores();
    const categories = await product.getCategories();
    const retailerProductData = await product.getRetailerProducts(req.session.uid, req.query);

    let editProduct = null;
    if (Number.isInteger(editProductId) && editProductId > 0) {
      editProduct = await product.getRetailerById(req.session.uid, editProductId);
    }

    return res.render("retailer-products", {
      stores,
      categories,
      products: retailerProductData.products,
      editProduct,
      createMode,
      filters: retailerProductData.filters
    });
  } catch (err) {
    console.error("Error in /retailer/products:", err);
    return res.status(500).send("Database error");
  }
}

async function createRetailerProduct(req, res) {
  const {
    name,
    description = "",
    price,
    stock,
    status = "active",
    category_id,
    store_id
  } = req.body;

  const normalizedName = typeof name === "string" ? name.trim() : "";
  const normalizedDescription = typeof description === "string" ? description.trim() : "";
  const uploadedImagePath = getUploadedImagePath(req.file);
  const normalizedStatus = status === "inactive" ? "inactive" : "active";
  const priceValue = Number(price);
  const stockValue = Number(stock);
  const categoryId = Number(category_id);
  const storeId = Number(store_id);

  if (!normalizedName || Number.isNaN(priceValue) || Number.isNaN(stockValue) || !Number.isInteger(categoryId) || !Number.isInteger(storeId)) {
    await deleteUploadedImage(uploadedImagePath);
    return res.redirect("/retailer/products?error=Please+fill+all+product+fields+correctly.");
  }

  try {
    const store = new Store(req.session.uid);
    const product = new Product(
      storeId,
      categoryId,
      normalizedName,
      normalizedDescription,
      priceValue,
      stockValue,
      normalizedStatus
    );

    const ownedStore = await store.getOwnedStoreById(storeId);
    if (!ownedStore) {
      await deleteUploadedImage(uploadedImagePath);
      return res.redirect("/retailer/products?error=Invalid+store+selection.");
    }

    const categoryExists = await product.categoryExists(categoryId);
    if (!categoryExists) {
      await deleteUploadedImage(uploadedImagePath);
      return res.redirect("/retailer/products?error=Select+a+valid+category.");
    }

    const productId = await product.create();

    if (uploadedImagePath) {
      await product.savePrimaryImage(productId, uploadedImagePath);
    }

    return res.redirect("/retailer/products?success=Product+created+successfully.");
  } catch (err) {
    console.error("Error creating retailer product:", err);
    await deleteUploadedImage(uploadedImagePath);
    return res.redirect("/retailer/products?error=Unable+to+create+product.");
  }
}

async function updateRetailerProduct(req, res) {
  const productId = Number(req.params.id);
  const {
    name,
    description = "",
    price,
    stock,
    status = "active",
    category_id,
    store_id
  } = req.body;

  if (!Number.isInteger(productId) || productId <= 0) {
    return res.redirect("/retailer/products?error=Invalid+product+selected.");
  }

  const normalizedName = typeof name === "string" ? name.trim() : "";
  const normalizedDescription = typeof description === "string" ? description.trim() : "";
  const uploadedImagePath = getUploadedImagePath(req.file);
  const normalizedStatus = status === "inactive" ? "inactive" : "active";
  const priceValue = Number(price);
  const stockValue = Number(stock);
  const categoryId = Number(category_id);
  const storeId = Number(store_id);

  if (!normalizedName || Number.isNaN(priceValue) || Number.isNaN(stockValue) || !Number.isInteger(categoryId) || !Number.isInteger(storeId)) {
    await deleteUploadedImage(uploadedImagePath);
    return res.redirect(`/retailer/products?edit=${productId}&error=Please+fill+all+product+fields+correctly.`);
  }

  try {
    const store = new Store(req.session.uid);
    const product = new Product(
      storeId,
      categoryId,
      normalizedName,
      normalizedDescription,
      priceValue,
      stockValue,
      normalizedStatus
    );

    const existingProduct = await product.getRetailerById(req.session.uid, productId);
    if (!existingProduct) {
      await deleteUploadedImage(uploadedImagePath);
      return res.redirect("/retailer/products?error=Product+not+found.");
    }

    const ownedStore = await store.getOwnedStoreById(storeId);
    if (!ownedStore) {
      await deleteUploadedImage(uploadedImagePath);
      return res.redirect(`/retailer/products?edit=${productId}&error=Invalid+store+selection.`);
    }

    const categoryExists = await product.categoryExists(categoryId);
    if (!categoryExists) {
      await deleteUploadedImage(uploadedImagePath);
      return res.redirect(`/retailer/products?edit=${productId}&error=Select+a+valid+category.`);
    }

    await product.update(productId);

    if (uploadedImagePath) {
      const previousImage = await product.savePrimaryImage(productId, uploadedImagePath);
      if (previousImage?.image_url) {
        await deleteUploadedImage(previousImage.image_url);
      }
    }

    return res.redirect("/retailer/products?success=Product+updated+successfully.");
  } catch (err) {
    console.error("Error updating retailer product:", err);
    await deleteUploadedImage(uploadedImagePath);
    return res.redirect(`/retailer/products?edit=${productId}&error=Unable+to+update+product.`);
  }
}

async function deleteRetailerProduct(req, res) {
  const productId = Number(req.params.id);

  if (!Number.isInteger(productId) || productId <= 0) {
    return res.redirect("/retailer/products?error=Invalid+product+selected.");
  }

  try {
    const product = new Product();
    const existingProduct = await product.getRetailerById(req.session.uid, productId);

    if (!existingProduct) {
      return res.redirect("/retailer/products?error=Product+not+found.");
    }

    const productImages = await product.getImages(productId);
    await product.delete(productId);

    for (const image of productImages) {
      await deleteUploadedImage(image.image_url);
    }

    return res.redirect("/retailer/products?success=Product+deleted+successfully.");
  } catch (err) {
    console.error("Error deleting retailer product:", err);
    return res.redirect("/retailer/products?error=Unable+to+delete+product.+Remove+related+orders+first.");
  }
}

module.exports = {
  createRetailerProduct,
  deleteRetailerProduct,
  renderDashboard,
  renderRetailerProducts,
  updateRetailerProduct
};
