CREATE DATABASE bankdb;

-- bank.sql
CREATE TABLE  accounts (
  account_number Int,
  full_name varchar(50),
  branch_name varchar(50),
  balance  Int
);

-- Sample data
INSERT INTO accounts (account_number, full_name, branch_name, balance)
VALUES
('1001', 'Manju Kumar', 'Bangalore Main', 5000),
('1002', 'Ravi Singh', 'Mysore Branch', 3000);

SELECT *FROM accounts
