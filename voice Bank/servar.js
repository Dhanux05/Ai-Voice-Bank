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
  const { full_name, branch_name, initial_balance, pin, email, phone, account_number } = req.body;

  console.log("=== REGISTRATION REQUEST ===");
  console.log("Full request body:", JSON.stringify(req.body, null, 2));
  console.log("Account number from body:", account_number);
  console.log("Account number type:", typeof account_number);
  console.log("Account number truthy check:", !!account_number);

  if (!full_name || !branch_name || !pin) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  // Account number is REQUIRED - must be provided by user
  if (!account_number || account_number === '' || String(account_number).trim() === '') {
    console.log("ERROR: Account number is required but not provided");
    return res.status(400).json({ message: "Account number is required. Please provide your account number." });
  }

  if (pin.length !== 4 || !/^\d+$/.test(pin)) {
    return res.status(400).json({ message: "PIN must be 4 digits" });
  }

  const balance = initial_balance ? parseFloat(initial_balance) : 0;

  console.log("=== PROCESSING ACCOUNT NUMBER ===");
  console.log("Account number received:", account_number);
  console.log("Account number type:", typeof account_number);
  
  // Clean and validate the account number
  const accountNumberStr = String(account_number).trim().replace(/\D/g, ''); // Remove non-numeric characters
  
  console.log("Cleaned account number:", accountNumberStr);
  
  if (!accountNumberStr || accountNumberStr.length < 4 || accountNumberStr.length > 12) {
    console.log("ERROR: Account number validation failed - length:", accountNumberStr.length);
    return res.status(400).json({ message: "Account number must be between 4 and 12 digits" });
  }
  
  const accountNumInt = parseInt(accountNumberStr, 10);
  console.log("Parsed account number integer:", accountNumInt);
  
  if (isNaN(accountNumInt) || accountNumInt <= 0) {
    console.log("ERROR: Invalid account number format - isNaN:", isNaN(accountNumInt), "<= 0:", accountNumInt <= 0);
    return res.status(400).json({ message: "Invalid account number format" });
  }

  console.log("✅ Using account number:", accountNumInt);

  // Check if account number already exists
  db.get("SELECT account_number FROM accounts WHERE account_number = ?", [accountNumInt], (err, row) => {
    if (err) {
      console.log("Database error checking account number:", err);
      return res.status(500).json({ message: "Database error" });
    }
    
    if (row) {
      console.log("Account number already exists:", accountNumInt);
      return res.status(400).json({ message: "Account number already exists. Please choose a different one." });
    }

    console.log("Account number is available, creating account...");

    // Use the provided account number
    db.run(
      `INSERT INTO accounts (account_number, full_name, branch_name, balance, pin, email, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [accountNumInt, full_name, branch_name, balance, pin, email || null, phone || null],
      (err2) => {
        if (err2) {
          console.log("Database error inserting account:", err2);
          if (err2.message.includes('UNIQUE constraint')) {
            return res.status(400).json({ message: "Account number already exists. Please choose a different one." });
          }
          return res.status(500).json({ message: "Registration failed" });
        }

        console.log("✅ Account created successfully with account number:", accountNumInt);
        res.json({
          message: "✅ Registration successful",
          account_number: accountNumInt,
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

// ==================== ADMIN ENDPOINTS ====================

// Get all users/accounts
app.get("/api/admin/users", (req, res) => {
  db.all("SELECT account_number, full_name, branch_name, balance, email, phone FROM accounts ORDER BY account_number", 
    (err, rows) => {
      if (err) {
        console.error("Get all users error:", err);
        return res.status(500).json({ error: "Database error" });
      }
      res.json({
        success: true,
        count: rows.length,
        users: rows
      });
    });
});

// Get single user by account number
app.get("/api/admin/users/:accountNumber", (req, res) => {
  const accNum = parseInt(req.params.accountNumber, 10);
  if (isNaN(accNum)) {
    return res.status(400).json({ error: "Invalid account number format" });
  }

  db.get("SELECT account_number, full_name, branch_name, balance, email, phone FROM accounts WHERE account_number = ?", 
    [accNum], (err, row) => {
      if (err) {
        console.error("Get user error:", err);
        return res.status(500).json({ error: "Database error" });
      }
      if (!row) {
        return res.status(404).json({ error: "Account not found" });
      }
      res.json({
        success: true,
        user: row
      });
    });
});

// Update user balance
app.put("/api/admin/users/:accountNumber/balance", (req, res) => {
  const accNum = parseInt(req.params.accountNumber, 10);
  const { balance } = req.body;

  if (isNaN(accNum)) {
    return res.status(400).json({ error: "Invalid account number format" });
  }

  if (balance === undefined || balance === null) {
    return res.status(400).json({ error: "Balance is required" });
  }

  const newBalance = parseFloat(balance);
  if (isNaN(newBalance) || newBalance < 0) {
    return res.status(400).json({ error: "Invalid balance amount" });
  }

  // Check if account exists
  db.get("SELECT * FROM accounts WHERE account_number = ?", [accNum], (err, row) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    if (!row) {
      return res.status(404).json({ error: "Account not found" });
    }

    const oldBalance = row.balance;

    // Update balance
    db.run("UPDATE accounts SET balance = ? WHERE account_number = ?", 
      [newBalance, accNum], (err2) => {
        if (err2) {
          console.error("Update balance error:", err2);
          return res.status(500).json({ error: "Failed to update balance" });
        }

        // Log admin transaction
        const transactionId = `ADMIN${Date.now()}${Math.floor(Math.random() * 10000)}`;
        db.run(`INSERT INTO transactions (transaction_id, from_account, to_account, transaction_type, amount, balance_after)
          VALUES (?, ?, ?, 'Admin Balance Update', ?, ?)`,
          [transactionId, accNum, accNum, newBalance - oldBalance, newBalance], (err3) => {
            if (err3) console.error("Transaction log error:", err3);
          });

        res.json({
          success: true,
          message: "Balance updated successfully",
          account_number: accNum,
          old_balance: oldBalance,
          new_balance: newBalance
        });
      });
  });
});

// Update user account details
app.put("/api/admin/users/:accountNumber", (req, res) => {
  const accNum = parseInt(req.params.accountNumber, 10);
  const { full_name, branch_name, email, phone, pin } = req.body;

  if (isNaN(accNum)) {
    return res.status(400).json({ error: "Invalid account number format" });
  }

  // Check if account exists
  db.get("SELECT * FROM accounts WHERE account_number = ?", [accNum], (err, row) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    if (!row) {
      return res.status(404).json({ error: "Account not found" });
    }

    // Validate PIN if provided
    if (pin && (pin.length !== 4 || !/^\d+$/.test(pin))) {
      return res.status(400).json({ error: "PIN must be 4 digits" });
    }

    // Build update query dynamically based on provided fields
    const updates = [];
    const values = [];

    if (full_name !== undefined) {
      updates.push("full_name = ?");
      values.push(full_name);
    }
    if (branch_name !== undefined) {
      updates.push("branch_name = ?");
      values.push(branch_name);
    }
    if (email !== undefined) {
      updates.push("email = ?");
      values.push(email);
    }
    if (phone !== undefined) {
      updates.push("phone = ?");
      values.push(phone);
    }
    if (pin !== undefined) {
      updates.push("pin = ?");
      values.push(pin);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    values.push(accNum);

    const updateQuery = `UPDATE accounts SET ${updates.join(", ")} WHERE account_number = ?`;

    db.run(updateQuery, values, (err2) => {
      if (err2) {
        console.error("Update account error:", err2);
        return res.status(500).json({ error: "Failed to update account" });
      }

      // Get updated account
      db.get("SELECT account_number, full_name, branch_name, balance, email, phone FROM accounts WHERE account_number = ?", 
        [accNum], (err3, updatedRow) => {
          if (err3) {
            console.error("Get updated account error:", err3);
            return res.status(500).json({ error: "Account updated but failed to retrieve" });
          }

          res.json({
            success: true,
            message: "Account updated successfully",
            user: updatedRow
          });
        });
    });
  });
});

// Delete user account
app.delete("/api/admin/users/:accountNumber", (req, res) => {
  const accNum = parseInt(req.params.accountNumber, 10);

  if (isNaN(accNum)) {
    return res.status(400).json({ error: "Invalid account number format" });
  }

  // Check if account exists
  db.get("SELECT * FROM accounts WHERE account_number = ?", [accNum], (err, row) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    if (!row) {
      return res.status(404).json({ error: "Account not found" });
    }

    // Delete account
    db.run("DELETE FROM accounts WHERE account_number = ?", [accNum], (err2) => {
      if (err2) {
        console.error("Delete account error:", err2);
        return res.status(500).json({ error: "Failed to delete account" });
      }

      res.json({
        success: true,
        message: "Account deleted successfully",
        deleted_account: accNum
      });
    });
  });
});

// Get all transactions (admin view)
app.get("/api/admin/transactions", (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;

  db.all(`SELECT * FROM transactions 
          ORDER BY timestamp DESC 
          LIMIT ? OFFSET ?`,
    [limit, offset], (err, rows) => {
      if (err) {
        console.error("Get all transactions error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      // Get total count
      db.get("SELECT COUNT(*) as total FROM transactions", (err2, countRow) => {
        if (err2) {
          console.error("Count error:", err2);
          return res.status(500).json({ error: "Database error" });
        }

        res.json({
          success: true,
          total: countRow.total,
          limit: limit,
          offset: offset,
          transactions: rows
        });
      });
    });
});

// Get account statistics
app.get("/api/admin/stats", (req, res) => {
  db.get(`SELECT 
            COUNT(*) as total_accounts,
            SUM(balance) as total_balance,
            AVG(balance) as average_balance,
            MIN(balance) as min_balance,
            MAX(balance) as max_balance
          FROM accounts`, (err, stats) => {
    if (err) {
      console.error("Stats error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    db.get("SELECT COUNT(*) as total_transactions FROM transactions", (err2, txStats) => {
      if (err2) {
        console.error("Transaction stats error:", err2);
        return res.status(500).json({ error: "Database error" });
      }

      res.json({
        success: true,
        accounts: {
          total: stats.total_accounts,
          total_balance: stats.total_balance || 0,
          average_balance: Math.round(stats.average_balance || 0),
          min_balance: stats.min_balance || 0,
          max_balance: stats.max_balance || 0
        },
        transactions: {
          total: txStats.total_transactions
        }
      });
    });
  });
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
