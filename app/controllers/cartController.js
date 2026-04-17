const { Cart } = require("../models/cart");
const { Product } = require("../models/product");

async function renderCart(req, res) {
  try {
    const cart = new Cart(req.session.uid);
    const items = await cart.getItems();
    const itemCount = items.reduce(function(total, item) {
      return total + Number(item.quantity || 0);
    }, 0);
    const subtotal = items.reduce(function(total, item) {
      return total + Number(item.line_total || 0);
    }, 0);

    return res.render("cart", {
      items,
      summary: {
        itemCount,
        subtotal
      }
    });
  } catch (err) {
    console.error("Error in /cart:", err);
    return res.status(500).send("Database error");
  }
}

async function addToCart(req, res) {
  const productId = Number(req.params.id);
  const quantity = Math.max(1, Number(req.body.quantity) || 1);

  if (!Number.isInteger(productId) || productId <= 0) {
    return res.redirect("/products?error=Invalid+product+selected.");
  }

  try {
    const product = new Product();
    const selectedProduct = await product.getById(productId);

    if (!selectedProduct) {
      return res.redirect("/products?error=Product+not+found.");
    }

    if (Number(selectedProduct.stock) <= 0) {
      return res.redirect(`/products/${productId}?error=Product+is+out+of+stock.`);
    }

    const cart = new Cart(req.session.uid);
    await cart.addItem(productId, quantity);

    return res.redirect("/cart?success=Product+added+to+cart.");
  } catch (err) {
    console.error("Error adding to cart:", err);
    return res.redirect("/products?error=Unable+to+add+product+to+cart.");
  }
}

async function updateCartItem(req, res) {
  const cartItemId = Number(req.params.id);
  const quantity = Number(req.body.quantity);

  if (!Number.isInteger(cartItemId) || cartItemId <= 0 || Number.isNaN(quantity)) {
    return res.redirect("/cart?error=Invalid+cart+update.");
  }

  try {
    const cart = new Cart(req.session.uid);
    await cart.updateItemQuantity(cartItemId, quantity);
    return res.redirect("/cart?success=Cart+updated.");
  } catch (err) {
    console.error("Error updating cart:", err);
    return res.redirect("/cart?error=Unable+to+update+cart.");
  }
}

async function removeCartItem(req, res) {
  const cartItemId = Number(req.params.id);

  if (!Number.isInteger(cartItemId) || cartItemId <= 0) {
    return res.redirect("/cart?error=Invalid+cart+item.");
  }

  try {
    const cart = new Cart(req.session.uid);
    await cart.removeItem(cartItemId);
    return res.redirect("/cart?success=Item+removed+from+cart.");
  } catch (err) {
    console.error("Error removing cart item:", err);
    return res.redirect("/cart?error=Unable+to+remove+item.");
  }
}

module.exports = {
  addToCart,
  removeCartItem,
  renderCart,
  updateCartItem
};
