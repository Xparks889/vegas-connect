const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(bodyParser.json());

/* ================= STATIC FILES ================= */
const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));

/* ================= TELEGRAM ================= */
const BOT_TOKEN = "8789997391:AAEV0Pn4VKMdt193mONgpdFXwTDQTsW8CI8";
const CHAT_ID = "8768069734";

async function sendTelegram(message){
    try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: message
            })
        });
    } catch (err) {
        console.log("Telegram error:", err.message);
    }
}

/* ================= DATABASE ================= */
const db = new sqlite3.Database("database.db");

/* ================= TABLES ================= */
db.run(`CREATE TABLE IF NOT EXISTS stock (
    id INTEGER PRIMARY KEY,
    quantity INTEGER
)`);

db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT,
    location TEXT,
    quantity INTEGER,
    total INTEGER,
    deposit INTEGER,
    mpesa_code TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT
)`);

/* ================= INIT STOCK ================= */
db.get("SELECT * FROM stock WHERE id=1", (err, row) => {
    if (!row) {
        db.run("INSERT INTO stock (id, quantity) VALUES (1, 100)");
    }
});

/* ================= STOCK ================= */
app.get("/stock", (req, res) => {
    db.get("SELECT quantity FROM stock WHERE id=1", (err, row) => {
        res.json(row || { quantity: 0 });
    });
});

/* ================= ORDER ================= */
app.post("/order", (req, res) => {

    const { name, phone, location, quantity, total, deposit, mpesa_code } = req.body;

    if(!name || !phone || !location || !quantity){
        return res.json({ success:false, message:"Fill all details" });
    }

    db.get("SELECT quantity FROM stock WHERE id=1", (err, row) => {

        let stock = row ? row.quantity : 0;
        let qty = Number(quantity);

        if (stock <= 0) {
            return res.json({ success: false, message: "Out of stock" });
        }

        if (stock < qty) {
            return res.json({ success: false, message: "Not enough stock" });
        }

        db.run(
            `INSERT INTO orders (name, phone, location, quantity, total, deposit, mpesa_code)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [name, phone, location, qty, total, deposit, mpesa_code]
        );

        db.run("UPDATE stock SET quantity = quantity - ? WHERE id=1", [qty]);

        sendTelegram(
`🛒 NEW ORDER

Name: ${name}
Phone: ${phone}
Location: ${location}
Qty: ${qty}
Total: ${total}
Deposit: ${deposit}
Code: ${mpesa_code}

🌐 Site: https://YOUR-RENDER-LINK.onrender.com`
        );

        res.json({ success: true });
    });
});

/* ================= NOTIFY ================= */
app.post("/notify", (req, res) => {

    const { name, phone } = req.body;

    if(!name || !phone){
        return res.json({ success:false });
    }

    db.run(
        "INSERT INTO notifications (name, phone) VALUES (?, ?)",
        [name, phone]
    );

    /* FIXED TELEGRAM MESSAGE */
    sendTelegram(
`🔔 NEW NOTIFY REQUEST

Name: ${name}
Phone: ${phone}

🌐 Website: https://YOUR-RENDER-LINK.onrender.com
📦 Stock notification request`
    );

    res.json({ success: true });
});

/* ================= ADMIN ================= */
app.get("/admin", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "admin.html"));
});

/* ================= ADMIN DATA ================= */
app.get("/admin/orders", (req, res) => {
    db.all("SELECT * FROM orders ORDER BY id DESC", (err, rows) => {
        res.json(rows || []);
    });
});

app.get("/admin/notifications", (req, res) => {
    db.all("SELECT * FROM notifications ORDER BY id DESC", (err, rows) => {
        res.json(rows || []);
    });
});

/* ================= RESTOCK ================= */
app.post("/restock", (req, res) => {

    const { quantity } = req.body;

    db.run("UPDATE stock SET quantity = ? WHERE id=1", [quantity]);

    sendTelegram(`📦 STOCK UPDATED → New Stock: ${quantity}`);

    res.json({ success: true });
});

/* ================= START (RENDER FIX) ================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log("🔥 Server running on port " + PORT);
});