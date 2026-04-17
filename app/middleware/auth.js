function getPostLoginRedirect(req) {
  return req.session.userRole === "retailer" ? "/retailer/dashboard" : "/products";
}

function attachSessionLocals(req, res, next) {
  res.locals.uid = req.session.uid;
  res.locals.loggedIn = req.session.loggedIn;
  res.locals.userRole = req.session.userRole || "";
  res.locals.userName = req.session.userName || "";
  res.locals.authError = typeof req.query.error === "string" ? req.query.error : "";
  res.locals.authSuccess = typeof req.query.success === "string" ? req.query.success : "";
  next();
}

function requireLogin(req, res, next) {
  if (req.session.loggedIn) {
    return next();
  }

  return res.redirect("/login?error=Please+log+in+to+continue.");
}

function requireRetailer(req, res, next) {
  if (!req.session.loggedIn) {
    return res.redirect("/login?error=Please+log+in+to+continue.");
  }

  if (req.session.userRole !== "retailer") {
    return res.redirect("/products?error=Retailer+access+required.");
  }

  return next();
}

function redirectIfLoggedIn(req, res, next) {
  if (req.session.loggedIn) {
    return res.redirect(getPostLoginRedirect(req));
  }

  return next();
}

module.exports = {
  attachSessionLocals,
  getPostLoginRedirect,
  redirectIfLoggedIn,
  requireLogin,
  requireRetailer
};
