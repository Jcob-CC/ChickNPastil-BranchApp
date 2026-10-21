const port = 3000;

const Database = require('better-sqlite3');
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const db = new Database('./database.sqlite', { verbose: console.log });

// Read and execute the .sql schema file
try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    db.exec(schemaSql);
    console.log('Database schema initialized successfully.');
} 
catch (err) {
    console.error('Error initializing schema:', err.message);
}

app.use(express.static(path.join(__dirname, 'app')));

app.use('/supply', require('./routes/supply'))
app.use('/user', require('./routes/user'))

app.get('/', (req, res) => {
    res.redirect('/user/login');
});

app.listen(port, () => {
    console.log('Server is running on localhost:' + port);
}); 