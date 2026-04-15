const db = require('../services/db');
const bcrypt = require("bcryptjs");

class User {
    id;
    email;
    name;
    phone;
    role;

    constructor(email, name = null, phone = null, role = "customer") {
        this.email = email;
        this.name = name;
        this.phone = phone;
        this.role = role;
    }

    async getIdFromEmail() {
        const sql = "SELECT user_id FROM users WHERE email = ?";
        const result = await db.query(sql, [this.email]);
        if (result.length > 0) {
            this.id = result[0].user_id;
            return this.id;
        } else {
            return false;
        }
    }

    async setUserPassword(password) {
        const pw = await bcrypt.hash(password, 10);
        const sql = "UPDATE users SET password = ? WHERE user_id = ?";
        await db.query(sql, [pw, this.id]);
        return true;
    }

    async addUser(password) {
        const pw = await bcrypt.hash(password, 10);
        const sql = "INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)";
        const result = await db.query(sql, [this.name, this.email, pw, this.phone, this.role]);
        this.id = result.insertId;
        return true;
    }

    async authenticate(submittedPassword) {
        const sql = "SELECT password FROM users WHERE user_id = ?";
        const result = await db.query(sql, [this.id]);
        if (result.length === 0) return false;

        const match = await bcrypt.compare(submittedPassword, result[0].password);
        return match;
    }
}

module.exports = { User };
