const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

/* ================= STATIC ================= */
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
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

/* ================= INIT DB ================= */
async function initDB(){
    try {

        await pool.query(`
        CREATE TABLE IF NOT EXISTS stock (
            id INTEGER PRIMARY KEY,
            quantity INTEGER
        )`);

        await pool.query(`
        CREATE TABLE IF NOT EXISTS orders (
            id SERIAL PRIMARY KEY,
            name TEXT,
            phone TEXT,
            location TEXT,
            quantity INTEGER,
            total INTEGER,
            deposit INTEGER,
            mpesa_code TEXT
        )`);

        await pool.query(`
        CREATE TABLE IF NOT EXISTS notifications (
            id SERIAL PRIMARY KEY,
            name TEXT,
            phone TEXT
        )`);

        const res = await pool.query("SELECT * FROM stock WHERE id=1");

        if(res.rows.length === 0){
            await pool.query("INSERT INTO stock (id, quantity) VALUES (1, 0)");
        }

        console.log("✅ Database ready");

    } catch (err) {
        console.log("DB init error:", err.message);
    }
}

initDB();

/* ================= STOCK ================= */
app.get("/stock", async (req, res) => {
    try {
        const result = await pool.query("SELECT quantity FROM stock WHERE id=1");
        res.json(result.rows[0] || { quantity: 0 });
    } catch {
        res.json({ quantity: 0 });
    }
});

/* ================= ORDER ================= */
app.post("/order", async (req, res) => {

    try {

        const { name, phone, location, quantity, total, deposit, mpesa_code } = req.body;

        if(!name || !phone || !location || !quantity){
            return res.json({ success:false, message:"Fill all details" });
        }

        const stockRow = await pool.query("SELECT quantity FROM stock WHERE id=1");
        let stock = stockRow.rows[0].quantity;
        let qty = Number(quantity);

        if(stock <= 0){
            return res.json({ success:false, message:"Out of stock" });
        }

        if(stock < qty){
            return res.json({ success:false, message:"Not enough stock" });
        }

        await pool.query(
            `INSERT INTO orders (name, phone, location, quantity, total, deposit, mpesa_code)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [name, phone, location, qty, total, deposit, mpesa_code]
        );

        await pool.query(
            "UPDATE stock SET quantity = quantity - $1 WHERE id=1",
            [qty]
        );

        await sendTelegram(
`🛒 NEW ORDER

Name: ${name}
Phone: ${phone}
Location: ${location}
Qty: ${qty}
Total: ${total}
Deposit: ${deposit}
Code: ${mpesa_code}

🌐 https://vegas-connect-1.onrender.com`
        );

        res.json({ success:true });

    } catch (err) {
        console.log("ORDER ERROR:", err.message);
        res.json({ success:false });
    }
});

/* ================= NOTIFY ================= */
app.post("/notify", async (req, res) => {

    try {

        const { name, phone } = req.body;

        if(!name || !phone){
            return res.json({ success:false });
        }

        await pool.query(
            "INSERT INTO notifications (name, phone) VALUES ($1,$2)",
            [name, phone]
        );

        await sendTelegram(
`🔔 NEW NOTIFY REQUEST

Name: ${name}
Phone: ${phone}

🌐 https://vegas-connect-1.onrender.com`
        );

        res.json({ success:true });

    } catch (err) {
        console.log("NOTIFY ERROR:", err.message);
        res.json({ success:false });
    }
});

/* ================= ADMIN ================= */
app.get("/admin", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "admin.html"));
});

/* ================= ADMIN DATA ================= */
app.get("/admin/orders", async (req, res) => {
    try {
        const rows = await pool.query("SELECT * FROM orders ORDER BY id DESC");
        res.json(rows.rows || []);
    } catch {
        res.json([]);
    }
});

app.get("/admin/notifications", async (req, res) => {
    try {
        const rows = await pool.query("SELECT * FROM notifications ORDER BY id DESC");
        res.json(rows.rows || []);
    } catch {
        res.json([]);
    }
});

/* ================= RESTOCK ================= */
app.post("/restock", async (req, res) => {

    try {

        const { quantity } = req.body;

        await pool.query(
            "UPDATE stock SET quantity = $1 WHERE id=1",
            [quantity]
        );

        await sendTelegram(`📦 STOCK UPDATED → ${quantity}`);

        res.json({ success:true });

    } catch (err) {
        console.log("RESTOCK ERROR:", err.message);
        res.json({ success:false });
    }
});

/* ================= START ================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log("🔥 Server running on port " + PORT);
});