const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ MySQL Connection
const db = mysql.createConnection({
  host: "localhost",      // Your MySQL host
  user: "root",           //Your MySQL username    
  password: "root@137",           //Your MySQL password         
  database: "bank_system" //Your database name  
});

// ✅ Connect to MySQL
db.connect((err) => {
  if (err) {
    console.error("❌ MySQL Connection Error:", err);
  } else {
    console.log("✅ Connected to MySQL Database!");
  }
});

// ✅ API: Get account details by account number
app.get("/account/:accNumber", (req, res) => {
  const accNumber = req.params.accNumber;
  const query = "SELECT * FROM accounts WHERE account_number = ?";

  db.query(query, [accNumber], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database query error" });
    }

    if (result.length === 0) {
      return res.status(404).json({ error: "Account not found" });
    }

    res.json(result[0]);
  });
});

// ✅ Start server
const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
