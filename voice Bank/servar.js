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

  // Convert account_number to integer for proper comparison
  const accNum = parseInt(account_number, 10);
  if (isNaN(accNum)) {
    return res.status(400).json({ message: "Invalid account number format" });
  }

  // Check if account exists
  db.get("SELECT * FROM accounts WHERE account_number = ?", [accNum], (err, row) => {
    if (err) return res.status(500).json({ message: "Database error" });
    if (!row) return res.status(404).json({ message: "Account not found" });

    const newBalance = row.balance + parseFloat(deposit_amount);
    const transactionId = `TXN${Date.now()}${Math.floor(Math.random() * 10000)}`;

    // Update balance
    db.run("UPDATE accounts SET balance = ? WHERE account_number = ?", [newBalance, accNum], (err2) => {
      if (err2) return res.status(500).json({ message: "Update failed" });

      // Log transaction
      db.run(`INSERT INTO transactions (transaction_id, from_account, to_account, transaction_type, amount, balance_after)
        VALUES (?, ?, ?, 'Deposit', ?, ?)`,
        [transactionId, accNum, accNum, parseFloat(deposit_amount), newBalance], (err3) => {
          if (err3) console.error("Transaction log error:", err3);
        });

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
  const accNo = parseInt(req.params.accNo, 10);
  if (isNaN(accNo)) {
    return res.status(400).json({ message: "Invalid account number format" });
  }
  
  db.get("SELECT * FROM accounts WHERE account_number = ?", [accNo], (err, row) => {
    if (err) return res.status(500).json({ message: "Database error" });
    if (!row) return res.status(404).json({ message: "Account not found" });
    res.json(row);
  });
});

// Balance endpoint (for frontend)
app.get("/api/balance/:accNo", (req, res) => {
  const accNo = parseInt(req.params.accNo, 10);
  if (isNaN(accNo)) {
    return res.status(400).json({ error: "Invalid account number format" });
  }
  
  db.get("SELECT * FROM accounts WHERE account_number = ?", [accNo], (err, row) => {
    if (err) {
      console.error("Balance check error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    if (!row) {
      return res.status(404).json({ error: "Account not found" });
    }
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

  // Convert account_number to integer for proper comparison
  const accNum = parseInt(account_number, 10);
  if (isNaN(accNum)) {
    return res.status(400).json({ message: "Invalid account number format" });
  }

  db.get("SELECT * FROM accounts WHERE account_number = ?", [accNum], (err, row) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    if (!row) {
      console.log(`Account not found: ${accNum}`);
      return res.status(404).json({ message: "Account not found" });
    }
    
    // Compare PIN as strings to ensure exact match
    if (String(row.pin) !== String(pin)) {
      console.log(`PIN mismatch for account ${accNum}: stored=${row.pin}, provided=${pin}`);
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

  // Convert account_number to integer for proper comparison
  const accNum = parseInt(account_number, 10);
  if (isNaN(accNum)) {
    return res.status(400).json({ message: "Invalid account number format" });
  }

  const amount = parseFloat(withdraw_amount);

  // Check if account exists and verify PIN
  db.get("SELECT * FROM accounts WHERE account_number = ?", [accNum], (err, row) => {
    if (err) return res.status(500).json({ message: "Database error" });
    if (!row) return res.status(404).json({ message: "Account not found" });

    // Verify PIN - compare as strings
    if (String(row.pin) !== String(pin)) {
      return res.status(401).json({ message: "Invalid PIN" });
    }

    // Check if sufficient balance
    if (row.balance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const newBalance = row.balance - amount;
    const transactionId = `TXN${Date.now()}${Math.floor(Math.random() * 10000)}`;

    // Update balance
    db.run("UPDATE accounts SET balance = ? WHERE account_number = ?", [newBalance, accNum], (err2) => {
      if (err2) return res.status(500).json({ message: "Update failed" });

      // Log transaction
      db.run(`INSERT INTO transactions (transaction_id, from_account, to_account, transaction_type, amount, balance_after)
        VALUES (?, ?, ?, 'Withdrawal', ?, ?)`,
        [transactionId, accNum, accNum, amount, newBalance], (err3) => {
          if (err3) console.error("Transaction log error:", err3);
        });

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

// Transfer endpoint
app.post("/transfer", (req, res) => {
  const { from_account, to_account, amount, pin } = req.body;

  if (!from_account || !to_account || !amount || !pin) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const fromAccNum = parseInt(from_account, 10);
  const toAccNum = parseInt(to_account, 10);
  const transferAmount = parseFloat(amount);

  if (isNaN(fromAccNum) || isNaN(toAccNum)) {
    return res.status(400).json({ message: "Invalid account number format" });
  }

  if (fromAccNum === toAccNum) {
    return res.status(400).json({ message: "From and To accounts cannot be the same" });
  }

  // Get sender account
  db.get("SELECT * FROM accounts WHERE account_number = ?", [fromAccNum], (err, senderRow) => {
    if (err) return res.status(500).json({ message: "Database error" });
    if (!senderRow) return res.status(404).json({ message: "Sender account not found" });

    // Verify PIN
    if (String(senderRow.pin) !== String(pin)) {
      return res.status(401).json({ message: "Invalid PIN" });
    }

    // Check sufficient balance
    if (senderRow.balance < transferAmount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // Get recipient account
    db.get("SELECT * FROM accounts WHERE account_number = ?", [toAccNum], (err2, recipientRow) => {
      if (err2) return res.status(500).json({ message: "Database error" });
      if (!recipientRow) return res.status(404).json({ message: "Recipient account not found" });

      const senderNewBalance = senderRow.balance - transferAmount;
      const recipientNewBalance = recipientRow.balance + transferAmount;
      const transactionId = `TXN${Date.now()}${Math.floor(Math.random() * 10000)}`;

      // Start transaction
      db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        // Update sender balance
        db.run("UPDATE accounts SET balance = ? WHERE account_number = ?", 
          [senderNewBalance, fromAccNum], (err3) => {
            if (err3) {
              db.run("ROLLBACK");
              return res.status(500).json({ message: "Transfer failed" });
            }

            // Update recipient balance
            db.run("UPDATE accounts SET balance = ? WHERE account_number = ?", 
              [recipientNewBalance, toAccNum], (err4) => {
                if (err4) {
                  db.run("ROLLBACK");
                  return res.status(500).json({ message: "Transfer failed" });
                }

                // Log transaction for sender
                db.run(`INSERT INTO transactions (transaction_id, from_account, to_account, transaction_type, amount, balance_after)
                  VALUES (?, ?, ?, 'Transfer', ?, ?)`,
                  [transactionId + '_S', fromAccNum, toAccNum, transferAmount, senderNewBalance], (err5) => {
                    if (err5) console.error("Transaction log error:", err5);
                  });

                // Log transaction for recipient
                db.run(`INSERT INTO transactions (transaction_id, from_account, to_account, transaction_type, amount, balance_after)
                  VALUES (?, ?, ?, 'Transfer', ?, ?)`,
                  [transactionId + '_R', fromAccNum, toAccNum, transferAmount, recipientNewBalance], (err6) => {
                    if (err6) console.error("Transaction log error:", err6);
                  });

                db.run("COMMIT");

                res.json({
                  message: "✅ Transfer successful",
                  from_account: fromAccNum,
                  to_account: toAccNum,
                  from_name: senderRow.full_name,
                  to_name: recipientRow.full_name,
                  amount: transferAmount,
                  sender_balance_after: senderNewBalance,
                  recipient_balance_after: recipientNewBalance,
                  transaction_id: transactionId
                });
              });
          });
      });
    });
  });
});

// Get transaction history endpoint
app.get("/api/transactions/:accNo", (req, res) => {
  const accNo = parseInt(req.params.accNo, 10);
  if (isNaN(accNo)) {
    return res.status(400).json({ error: "Invalid account number format" });
  }

  db.all(`SELECT * FROM transactions 
          WHERE from_account = ? OR to_account = ? 
          ORDER BY timestamp DESC LIMIT 50`,
    [accNo, accNo], (err, rows) => {
      if (err) {
        console.error("Transaction history error:", err);
        return res.status(500).json({ error: "Database error" });
      }
      res.json(rows || []);
    });
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
