const Database = require('better-sqlite3');
const path = require('path');

module.exports = new Database(
    path.join(__dirname, '..', 'database.sqlite')
);