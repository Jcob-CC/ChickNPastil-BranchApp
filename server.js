const port = 3000;

require('dotenv').config();

const { randomBytes } = require('crypto');
const session = require('express-session');
const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./lib/database');
const auth = require('./middleware/auth');

const app = express();

const schemaPath = path.join(__dirname, 'schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');
db.exec(schemaSql);
require('./lib/sales_schema').migrate(db);
console.log('Database schema initialized successfully.');

app.use(express.static(path.join(__dirname, 'app')));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
    secret: process.env.SESSION_SECRET || randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
    },
}));

app.use(auth);
app.use('/supply', require('./routes/supply'));
app.use('/user', require('./routes/user'));
const sales = require('./routes/sales');
app.use('/sales', sales.pages);
app.use('/api', sales.api);

app.get('/', (req, res) => {
    res.redirect('/user/login');
});

app.listen(port, () => {
    console.log('Server is running on localhost:' + port);
}); 