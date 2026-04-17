const fs = require("fs");
const path = require("path");
const multer = require("multer");

const uploadsDir = path.join(__dirname, "..", "..", "static", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const productImageStorage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function(req, file, cb) {
    const extension = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, `product-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
  }
});

const productImageUpload = multer({
  storage: productImageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: function(req, file, cb) {
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

    if (allowedMimeTypes.includes(file.mimetype)) {
      return cb(null, true);
    }

    return cb(new Error("Only image files are allowed."));
  }
});

function handleProductImageUpload(req, res, next) {
  productImageUpload.single("image")(req, res, function(err) {
    if (!err) {
      return next();
    }

    const productId = Number(req.params.id);
    const redirectTarget = Number.isInteger(productId) && productId > 0
      ? `/retailer/products?edit=${productId}&error=Upload+a+valid+image+under+5MB.`
      : "/retailer/products?create=1&error=Upload+a+valid+image+under+5MB.";

    return res.redirect(redirectTarget);
  });
}

function getUploadedImagePath(file) {
  if (!file || !file.filename) {
    return "";
  }

  return `/uploads/${file.filename}`;
}

async function deleteUploadedImage(imageUrl) {
  if (typeof imageUrl !== "string" || !imageUrl.startsWith("/uploads/")) {
    return;
  }

  const fileName = path.basename(imageUrl);
  const filePath = path.join(uploadsDir, fileName);

  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error("Error deleting uploaded image:", err);
    }
  }
}

module.exports = {
  deleteUploadedImage,
  getUploadedImagePath,
  handleProductImageUpload
};
