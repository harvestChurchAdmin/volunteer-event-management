const { body } = require('express-validator');

exports.validateSignup = [
    body('name')
        .trim()
        .notEmpty().withMessage('Name is required.')
        .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters.')
        .escape(),
    body('email')
        .trim()
        .isEmail().withMessage('Please provide a valid email address.').bail()
        // Do NOT normalize destructively (e.g., removing dots/subaddresses).
        // Keep the exact email as entered to avoid delivery/account mismatches.
        // If needed later, only normalize the domain part, not the local part.
        .customSanitizer((v) => String(v).trim())
        // Basic hardening: disallow control characters to prevent header injection.
        .isLength({ max: 254 }).withMessage('Email must be at most 254 characters.')
        .custom(v => !(/[\r\n]/.test(v))).withMessage('Email contains invalid characters.'),
    body('phone')
        .trim()
        .custom(value => {
            if (value == null || String(value).trim() === '') return true;
            const digits = String(value || '').replace(/\D/g, '');
            if (digits.length !== 10) {
                throw new Error('Phone number must be 10 digits.');
            }
            return true;
        })
];
