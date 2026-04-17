function renderHome(req, res) {
  res.render("home");
}

function renderAbout(req, res) {
  res.render("about");
}

function renderContact(req, res) {
  res.render("contact");
}

module.exports = {
  renderAbout,
  renderContact,
  renderHome
};
