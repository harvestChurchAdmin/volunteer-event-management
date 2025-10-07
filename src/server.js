// Load environment variables from .env file at the very beginning.
require('dotenv').config();

const util = require('util');
// Node still exposes util.isArray via a deprecation wrapper. Several third-party
// packages (lodash/fp) hit that property which produced a noisy warning. Replacing
// the getter with the native Array.isArray keeps runtime behaviour identical while
// silencing the warning.
const isArrayDescriptor = Object.getOwnPropertyDescriptor(util, 'isArray');
if (isArrayDescriptor && typeof isArrayDescriptor.get === 'function') {
    Object.defineProperty(util, 'isArray', {
        value: Array.isArray,
        configurable: true,
        writable: true
    });
}

const app = require('./app');
const { initDatabase } = require('./config/database');

const PORT = process.env.PORT || 3002;

// Add request logging in development without forcing morgan in prod installs.
if (process.env.NODE_ENV === 'development') {
    try {
        const morgan = require('morgan');
        app.use(morgan('dev'));
    } catch (err) {
        console.warn('Morgan is not installed; skipping HTTP request logging.');
    }
}

// Initialize the database schema if it doesn't exist.
try {
    initDatabase();
    console.log('Database initialized successfully.');
} catch (err) {
    console.error('Failed to initialize database:', err);
    process.exit(1);
}

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT} in ${process.env.NODE_ENV} mode.`);
});
