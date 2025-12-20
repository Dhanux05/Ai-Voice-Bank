const sqlite3 = require("sqlite3").verbose();

// Quick script to add a user - Edit the values below
const newUser = {
  full_name: "John Doe",           // Change this
  branch_name: "Delhi Branch",      // Change this
  balance: 10000,                   // Change this
  pin: "9999",                      // Change this (4 digits)
  email: "john@example.com",        // Optional
  phone: "9876543212"               // Optional
};

const db = new sqlite3.Database("./bank.db", (err) => {
  if (err) {
    console.error("❌ Database error:", err.message);
    process.exit(1);
  } else {
    console.log("✅ Connected to SQLite database");
    
    // Get next 12-digit account number
    db.get("SELECT MAX(account_number) as max_acc FROM accounts", (err, row) => {
      if (err) {
        console.error("❌ Error:", err.message);
        db.close();
        return;
      }

      // Start from 100000000000 (12 digits) or increment from max
      const baseAccount = 100000000000; // 12-digit starting number
      const maxAcc = row.max_acc || (baseAccount - 1);
      const newAccountNumber = maxAcc >= baseAccount ? maxAcc + 1 : baseAccount;

      // Validate PIN
      if (newUser.pin.length !== 4 || !/^\d+$/.test(newUser.pin)) {
        console.error("❌ PIN must be exactly 4 digits!");
        db.close();
        return;
      }

      db.run(
        `INSERT INTO accounts (account_number, full_name, branch_name, balance, pin, email, phone)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          newAccountNumber,
          newUser.full_name,
          newUser.branch_name,
          newUser.balance,
          newUser.pin,
          newUser.email || null,
          newUser.phone || null
        ],
        (err2) => {
          if (err2) {
            console.error("❌ Error adding user:", err2.message);
          } else {
            console.log("\n✅ User added successfully!");
            console.log(`   Account Number: ${newAccountNumber}`);
            console.log(`   Name: ${newUser.full_name}`);
            console.log(`   Branch: ${newUser.branch_name}`);
            console.log(`   Balance: ₹${newUser.balance}`);
            console.log(`   PIN: ${newUser.pin}`);
          }
          db.close();
        }
      );
    });
  }
});


