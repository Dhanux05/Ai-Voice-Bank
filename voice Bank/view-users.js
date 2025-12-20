const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./bank.db", (err) => {
  if (err) {
    console.error("❌ Database error:", err.message);
    process.exit(1);
  } else {
    console.log("✅ Connected to SQLite database\n");
    
    // Get all users
    db.all("SELECT * FROM accounts ORDER BY account_number", (err, rows) => {
      if (err) {
        console.error("❌ Error reading users:", err.message);
        db.close();
        return;
      }
      
      if (rows.length === 0) {
        console.log("📋 No users found in the database.");
      } else {
        console.log(`📋 Total Registered Users: ${rows.length}\n`);
        console.log("=" .repeat(80));
        console.log("Account Number | Full Name          | Branch           | Balance | PIN   | Email              | Phone");
        console.log("-".repeat(80));
        
        rows.forEach((row, index) => {
          const accNum = String(row.account_number).padEnd(14);
          const name = (row.full_name || '').padEnd(18);
          const branch = (row.branch_name || '').padEnd(16);
          const balance = `₹${row.balance || 0}`.padEnd(8);
          const pin = (row.pin || 'N/A').padEnd(6);
          const email = (row.email || 'N/A').padEnd(19);
          const phone = row.phone || 'N/A';
          
          console.log(`${accNum} | ${name} | ${branch} | ${balance} | ${pin} | ${email} | ${phone}`);
        });
        
        console.log("=".repeat(80));
        console.log(`\n✅ Found ${rows.length} registered user(s)\n`);
      }
      
      db.close();
    });
  }
});

