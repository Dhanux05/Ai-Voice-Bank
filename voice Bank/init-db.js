const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./bank.db", (err) => {
  if (err) {
    console.error("❌ Database error:", err.message);
    process.exit(1);
  } else {
    console.log("✅ Connected to SQLite database");
    
    // Create table with PIN and registration fields
    db.run(`CREATE TABLE IF NOT EXISTS accounts (
      account_number INTEGER PRIMARY KEY,
      full_name VARCHAR(50),
      branch_name VARCHAR(50),
      balance INTEGER,
      pin VARCHAR(10),
      email VARCHAR(100),
      phone VARCHAR(20)
    )`, (err) => {
      if (err) {
        console.error("❌ Table creation error:", err.message);
        db.close();
        process.exit(1);
      } else {
        console.log("✅ Table 'accounts' created or already exists");
        
        // Create transactions table for transaction history
        db.run(`CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_id VARCHAR(50) UNIQUE,
          from_account INTEGER,
          to_account INTEGER,
          transaction_type VARCHAR(20),
          amount REAL,
          balance_after REAL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (from_account) REFERENCES accounts(account_number),
          FOREIGN KEY (to_account) REFERENCES accounts(account_number)
        )`, (err) => {
          if (err) {
            console.error("❌ Transactions table creation error:", err.message);
          } else {
            console.log("✅ Table 'transactions' created or already exists");
          }
        });
        
        // Add PIN and other columns if they don't exist (for existing databases)
        db.run("ALTER TABLE accounts ADD COLUMN pin VARCHAR(10)", (err) => {
          if (err && !err.message.includes("duplicate column")) {
            console.log("Note: PIN column may already exist");
          }
        });
        db.run("ALTER TABLE accounts ADD COLUMN email VARCHAR(100)", (err) => {
          if (err && !err.message.includes("duplicate column")) {
            console.log("Note: Email column may already exist");
          }
        });
        db.run("ALTER TABLE accounts ADD COLUMN phone VARCHAR(20)", (err) => {
          if (err && !err.message.includes("duplicate column")) {
            console.log("Note: Phone column may already exist");
          }
        });
        
        // Update existing accounts with default PINs if they don't have one
        db.run("UPDATE accounts SET pin = '1234' WHERE pin IS NULL OR pin = ''", (err) => {
          if (err) console.log("Note: Could not update existing PINs");
        });
        
        // Check if data exists
        db.get("SELECT COUNT(*) as count FROM accounts", (err, row) => {
          if (err) {
            console.error("❌ Error checking data:", err.message);
            db.close();
            process.exit(1);
          } else {
            if (row.count === 0) {
              // Insert sample data with PINs (12-digit account numbers)
              db.run(`INSERT INTO accounts (account_number, full_name, branch_name, balance, pin, email, phone)
                VALUES
                (100000000001, 'Manju Kumar', 'Bangalore Main', 5000, '1234', 'manju@example.com', '9876543210'),
                (100000000002, 'Ravi Singh', 'Mysore Branch', 3000, '5678', 'ravi@example.com', '9876543211')`, (err) => {
                if (err) {
                  console.error("❌ Data insertion error:", err.message);
                } else {
                  console.log("✅ Sample data inserted");
                }
                db.close();
                console.log("✅ Database initialization complete!");
              });
            } else {
              console.log("✅ Database already has data");
              db.close();
            }
          }
        });
      }
    });
  }
});

