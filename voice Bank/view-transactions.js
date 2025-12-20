const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./bank.db", (err) => {
  if (err) {
    console.error("❌ Database error:", err.message);
    process.exit(1);
  } else {
    console.log("✅ Connected to SQLite database\n");
    
    // Get all transactions
    db.all(`SELECT * FROM transactions 
            ORDER BY timestamp DESC 
            LIMIT 50`, (err, rows) => {
      if (err) {
        console.error("❌ Error reading transactions:", err.message);
        db.close();
        return;
      }
      
      if (rows.length === 0) {
        console.log("📋 No transactions found in the database.");
      } else {
        console.log(`📋 Recent Transactions (Last ${rows.length}):\n`);
        console.log("=".repeat(100));
        console.log("ID | Transaction ID      | From Account    | To Account      | Type      | Amount    | Balance After | Timestamp");
        console.log("-".repeat(100));
        
        rows.forEach((row) => {
          const id = String(row.id || '').padEnd(3);
          const txnId = (row.transaction_id || 'N/A').padEnd(20);
          const fromAcc = (row.from_account || 'N/A').toString().padEnd(15);
          const toAcc = (row.to_account || 'N/A').toString().padEnd(15);
          const type = (row.transaction_type || 'N/A').padEnd(9);
          const amount = `₹${row.amount || 0}`.padEnd(10);
          const balance = `₹${row.balance_after || 0}`.padEnd(13);
          const timestamp = row.timestamp || 'N/A';
          
          console.log(`${id} | ${txnId} | ${fromAcc} | ${toAcc} | ${type} | ${amount} | ${balance} | ${timestamp}`);
        });
        
        console.log("=".repeat(100));
        console.log(`\n✅ Found ${rows.length} transaction(s)\n`);
      }
      
      db.close();
    });
  }
});



