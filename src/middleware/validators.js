const { body } = require('express-validator');

exports.validateSignup = [
    body('name')
        .trim()
        .notEmpty().withMessage('Name is required.')
        .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters.')
        .escape(),
    body('email')
        .trim()
        .isEmail().withMessage('Please provide a valid email address.')
        .normalizeEmail(),
    body('phone')
        .trim()
        .notEmpty().withMessage('Phone number is required.')
        .isMobilePhone('any', { strictMode: false }).withMessage('Please provide a valid phone number.')
];