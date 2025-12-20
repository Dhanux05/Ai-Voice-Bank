const express = require("express");
const bodyParser = require("body-parser");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(bodyParser.json());

// Serve static files (HTML, CSS, JS)
app.use(express.static(__dirname));

// Connect to SQLite database
const db = new sqlite3.Database("./bank.db", (err) => {
  if (err) console.error("❌ Database error:", err.message);
  else console.log("✅ Connected to SQLite database");
});

// Endpoint to handle deposit
app.post("/deposit", (req, res) => {
  const { account_number, deposit_amount } = req.body;

  if (!account_number || !deposit_amount) {
    return res.status(400).json({ message: "Missing account number or amount" });
  }

  // Check if account exists
  db.get("SELECT * FROM accounts WHERE account_number = ?", [account_number], (err, row) => {
    if (err) return res.status(500).json({ message: "Database error" });
    if (!row) return res.status(404).json({ message: "Account not found" });

    const newBalance = row.balance + parseFloat(deposit_amount);

    // Update balance
    db.run("UPDATE accounts SET balance = ? WHERE account_number = ?", [newBalance, account_number], (err2) => {
      if (err2) return res.status(500).json({ message: "Update failed" });

      res.json({
        message: "✅ Deposit successful",
        account_number: row.account_number,
        full_name: row.full_name,
        branch_name: row.branch_name,
        old_balance: row.balance,
        new_balance: newBalance
      });
    });
  });
});

// Get account info / balance
app.get("/account/:accNo", (req, res) => {
  db.get("SELECT * FROM accounts WHERE account_number = ?", [req.params.accNo], (err, row) => {
    if (err) return res.status(500).json({ message: "Database error" });
    if (!row) return res.status(404).json({ message: "Account not found" });
    res.json(row);
  });
});

// Balance endpoint (for frontend)
app.get("/api/balance/:accNo", (req, res) => {
  db.get("SELECT * FROM accounts WHERE account_number = ?", [req.params.accNo], (err, row) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!row) return res.status(404).json({ error: "Account not found" });
    res.json({
      accountNumber: row.account_number,
      fullName: row.full_name,
      branch: row.branch_name,
      balance: row.balance
    });
  });
});

// User Registration endpoint
app.post("/register", (req, res) => {
  const { full_name, branch_name, initial_balance, pin, email, phone } = req.body;

  if (!full_name || !branch_name || !pin) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  if (pin.length !== 4 || !/^\d+$/.test(pin)) {
    return res.status(400).json({ message: "PIN must be 4 digits" });
  }

  // Generate 12-digit account number
  db.get("SELECT MAX(account_number) as max_acc FROM accounts", (err, row) => {
    if (err) return res.status(500).json({ message: "Database error" });

    // Start from 100000000000 (12 digits) or increment from max
    const baseAccount = 100000000000; // 12-digit starting number
    const maxAcc = row.max_acc || (baseAccount - 1);
    const newAccountNumber = maxAcc >= baseAccount ? maxAcc + 1 : baseAccount;
    const balance = initial_balance ? parseFloat(initial_balance) : 0;

    db.run(
      `INSERT INTO accounts (account_number, full_name, branch_name, balance, pin, email, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newAccountNumber, full_name, branch_name, balance, pin, email || null, phone || null],
      (err2) => {
        if (err2) return res.status(500).json({ message: "Registration failed" });

        res.json({
          message: "✅ Registration successful",
          account_number: newAccountNumber,
          full_name: full_name,
          branch_name: branch_name,
          balance: balance
        });
      }
    );
  });
});

// Verify PIN endpoint
app.post("/verify-pin", (req, res) => {
  const { account_number, pin } = req.body;

  if (!account_number || !pin) {
    return res.status(400).json({ message: "Missing account number or PIN" });
  }

  db.get("SELECT * FROM accounts WHERE account_number = ?", [account_number], (err, row) => {
    if (err) return res.status(500).json({ message: "Database error" });
    if (!row) return res.status(404).json({ message: "Account not found" });
    if (row.pin !== pin) {
      return res.status(401).json({ message: "Invalid PIN" });
    }

    res.json({ message: "PIN verified", account_number: row.account_number });
  });
});

// Withdraw endpoint with PIN verification
app.post("/withdraw", (req, res) => {
  const { account_number, withdraw_amount, pin } = req.body;

  if (!account_number || !withdraw_amount || !pin) {
    return res.status(400).json({ message: "Missing account number, amount, or PIN" });
  }

  const amount = parseFloat(withdraw_amount);

  // Check if account exists and verify PIN
  db.get("SELECT * FROM accounts WHERE account_number = ?", [account_number], (err, row) => {
    if (err) return res.status(500).json({ message: "Database error" });
    if (!row) return res.status(404).json({ message: "Account not found" });

    // Verify PIN
    if (row.pin !== pin) {
      return res.status(401).json({ message: "Invalid PIN" });
    }

    // Check if sufficient balance
    if (row.balance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const newBalance = row.balance - amount;

    // Update balance
    db.run("UPDATE accounts SET balance = ? WHERE account_number = ?", [newBalance, account_number], (err2) => {
      if (err2) return res.status(500).json({ message: "Update failed" });

      res.json({
        message: "✅ Withdrawal successful",
        account_number: row.account_number,
        full_name: row.full_name,
        branch_name: row.branch_name,
        old_balance: row.balance,
        withdraw_amount: amount,
        new_balance: newBalance
      });
    });
  });
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
