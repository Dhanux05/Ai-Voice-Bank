const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./bank.db", (err) => {
  if (err) {
    console.error("❌ Database error:", err.message);
    process.exit(1);
  } else {
    console.log("✅ Connected to SQLite database\n");
    console.log("=".repeat(100));
    console.log("📊 COMPLETE DATABASE VIEW");
    console.log("=".repeat(100));
    
    // Get all users
    db.all("SELECT * FROM accounts ORDER BY account_number", (err, rows) => {
      if (err) {
        console.error("❌ Error reading users:", err.message);
        db.close();
        return;
      }
      
      console.log("\n👥 REGISTERED USERS:");
      console.log("-".repeat(100));
      
      if (rows.length === 0) {
        console.log("📋 No users found in the database.");
      } else {
        console.log(`📋 Total Registered Users: ${rows.length}\n`);
        console.log("Account Number | Full Name          | Branch           | Balance    | PIN   | Email              | Phone");
        console.log("-".repeat(100));
        
        rows.forEach((row) => {
          const accNum = String(row.account_number).padEnd(14);
          const name = (row.full_name || '').padEnd(18);
          const branch = (row.branch_name || '').padEnd(16);
          const balance = `₹${row.balance || 0}`.padEnd(11);
          const pin = (row.pin || 'N/A').padEnd(6);
          const email = (row.email || 'N/A').padEnd(19);
          const phone = row.phone || 'N/A';
          
          console.log(`${accNum} | ${name} | ${branch} | ${balance} | ${pin} | ${email} | ${phone}`);
        });
      }
      
      // Get all transactions
      db.all(`SELECT * FROM transactions 
              ORDER BY timestamp DESC 
              LIMIT 50`, (err2, rows2) => {
        if (err2) {
          console.error("❌ Error reading transactions:", err2.message);
          db.close();
          return;
        }
        
        console.log("\n\n💳 RECENT TRANSACTIONS:");
        console.log("-".repeat(100));
        
        if (rows2.length === 0) {
          console.log("📋 No transactions found in the database.");
        } else {
          console.log(`📋 Recent Transactions (Last ${rows2.length}):\n`);
          console.log("Transaction ID      | From Account    | To Account      | Type      | Amount    | Balance After | Timestamp");
          console.log("-".repeat(100));
          
          rows2.forEach((row) => {
            const txnId = (row.transaction_id || 'N/A').padEnd(20);
            const fromAcc = (row.from_account || 'N/A').toString().padEnd(15);
            const toAcc = (row.to_account || 'N/A').toString().padEnd(15);
            const type = (row.transaction_type || 'N/A').padEnd(9);
            const amount = `₹${row.amount || 0}`.padEnd(10);
            const balance = `₹${row.balance_after || 0}`.padEnd(13);
            const timestamp = row.timestamp || 'N/A';
            
            console.log(`${txnId} | ${fromAcc} | ${toAcc} | ${type} | ${amount} | ${balance} | ${timestamp}`);
          });
        }
        
        console.log("\n" + "=".repeat(100));
        console.log("✅ Database view complete!\n");
        db.close();
      });
    });
  }
});



