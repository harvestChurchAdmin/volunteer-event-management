// src/routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { isAuthenticated } = require('../middleware/authMiddleware');

// Dashboard & event detail
router.get('/dashboard', isAuthenticated, adminController.showDashboard);
router.get('/event/:eventId', isAuthenticated, adminController.showEventDetail);

// Create
router.post('/event', isAuthenticated, adminController.createEvent);
router.post('/event/:eventId/stations', isAuthenticated, adminController.createStation);
router.post('/station/:stationId/blocks', isAuthenticated, adminController.createTimeBlock);

// Update
router.post('/event/:eventId/edit', isAuthenticated, adminController.updateEvent);
router.post('/event/:eventId/publish', isAuthenticated, adminController.setPublish);
router.post('/station/:stationId/edit', isAuthenticated, adminController.updateStation);
router.post('/block/:blockId/edit', isAuthenticated, adminController.updateTimeBlock);
router.post('/block/:blockId/reservations', isAuthenticated, adminController.addReservation);
router.post('/reservation/:reservationId/edit', isAuthenticated, adminController.updateReservation);
router.post('/reservation/:reservationId/delete', isAuthenticated, adminController.deleteReservation);

// Delete
router.post('/event/:eventId/delete', isAuthenticated, adminController.deleteEvent);
router.post('/station/:stationId/delete', isAuthenticated, adminController.deleteStation);
router.post('/block/:blockId/delete', isAuthenticated, adminController.deleteTimeBlock);

module.exports = router;
