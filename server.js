const express = require("express");
const Database = require("better-sqlite3");
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
const db = new Database("database.db");

/* ================= TABLES ================= */
db.prepare(`
CREATE TABLE IF NOT EXISTS stock (
    id INTEGER PRIMARY KEY,
    quantity INTEGER
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT,
    location TEXT,
    quantity INTEGER,
    total INTEGER,
    deposit INTEGER,
    mpesa_code TEXT
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT
)
`).run();

/* ================= INIT STOCK ================= */
const stockRow = db.prepare("SELECT * FROM stock WHERE id=1").get();
if (!stockRow) {
    db.prepare("INSERT INTO stock (id, quantity) VALUES (1, 100)").run();
}

/* ================= STOCK ================= */
app.get("/stock", (req, res) => {
    const row = db.prepare("SELECT quantity FROM stock WHERE id=1").get();
    res.json(row || { quantity: 0 });
});

/* ================= ORDER ================= */
app.post("/order", (req, res) => {

    const { name, phone, location, quantity, total, deposit, mpesa_code } = req.body;

    if(!name || !phone || !location || !quantity){
        return res.json({ success:false, message:"Fill all details" });
    }

    const row = db.prepare("SELECT quantity FROM stock WHERE id=1").get();
    let stock = row ? row.quantity : 0;
    let qty = Number(quantity);

    if (stock <= 0) {
        return res.json({ success: false, message: "Out of stock" });
    }

    if (stock < qty) {
        return res.json({ success: false, message: "Not enough stock" });
    }

    db.prepare(`
        INSERT INTO orders (name, phone, location, quantity, total, deposit, mpesa_code)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(name, phone, location, qty, total, deposit, mpesa_code);

    db.prepare("UPDATE stock SET quantity = quantity - ? WHERE id=1").run(qty);

    sendTelegram(
`🛒 NEW ORDER

Name: ${name}
Phone: ${phone}
Location: ${location}
Qty: ${qty}
Total: ${total}
Deposit: ${deposit}
Code: ${mpesa_code}

🌐 Site: https://vegas-connect-1.onrender.com/
    );

    res.json({ success: true });
});

/* ================= NOTIFY ================= */
app.post("/notify", (req, res) => {

    const { name, phone } = req.body;

    if(!name || !phone){
        return res.json({ success:false });
    }

    db.prepare(
        "INSERT INTO notifications (name, phone) VALUES (?, ?)"
    ).run(name, phone);

    sendTelegram(
`🔔 NEW NOTIFY REQUEST

Name: ${name}
Phone: ${phone}

🌐 Website: https://vegas-connect-1.onrender.com/
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
    const rows = db.prepare("SELECT * FROM orders ORDER BY id DESC").all();
    res.json(rows || []);
});

app.get("/admin/notifications", (req, res) => {
    const rows = db.prepare("SELECT * FROM notifications ORDER BY id DESC").all();
    res.json(rows || []);
});

/* ================= RESTOCK ================= */
app.post("/restock", (req, res) => {

    const { quantity } = req.body;

    db.prepare("UPDATE stock SET quantity = ? WHERE id=1").run(quantity);

    sendTelegram(`📦 STOCK UPDATED → New Stock: ${quantity}`);

    res.json({ success: true });
});

/* ================= START ================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log("🔥 Server running on port " + PORT);
});