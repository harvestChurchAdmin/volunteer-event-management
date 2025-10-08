// src/services/publicService.js
const crypto = require('crypto');
const createError = require('http-errors');
const dal = require('../db/dal');
const { fmt12 } = require('../views/helpers');
const { sendMail } = require('../utils/mailer');

/**
 * Base external URL used when issuing management links in transactional email.
 * Falls back to localhost in development so the links are still clickable when
 * running the server locally.
 */
const APP_BASE_URL = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

// Default lifetime (in days) for volunteer management tokens. Can be overridden
// per environment via MANAGE_TOKEN_TTL_DAYS.
const TOKEN_TTL_DAYS = Number(process.env.MANAGE_TOKEN_TTL_DAYS || 30);

/**
 * Returns all published events that still have an upcoming end date. This feeds
 * the public-facing event list view.
 */
function getPublicEvents() {
  return dal.public.listUpcomingEvents();
}

/**
 * Converts the flattened SQL result set (event joined to stations & time blocks)
 * into a nested structure that templates and controllers can work with.
 */
function mapEventRows(rows) {
  if (!rows || rows.length === 0 || !rows[0].event_id) return null;

  const event = {
    event_id: rows[0].event_id,
    name: rows[0].name,
    description: rows[0].description,
    date_start: rows[0].date_start,
    date_end: rows[0].date_end,
    stations: []
  };

  const stationMap = new Map();
  rows.forEach(row => {
    if (!row.station_id) return;
    if (!stationMap.has(row.station_id)) {
      const about = row.station_description_overview || row.station_description || row.s_description || '';
      const duties = row.station_description_tasks || '';
      stationMap.set(row.station_id, {
        station_id: row.station_id,
        name: row.station_name || row.s_name || row.name,
        about,
        duties,
        description: about,
        time_blocks: []
      });
    }
    if (row.block_id) {
      stationMap.get(row.station_id).time_blocks.push({
        block_id: row.block_id,
        start_time: row.start_time,
        end_time: row.end_time,
        capacity_needed: typeof row.capacity_needed !== 'undefined' ? row.capacity_needed : row.capacity,
        reserved_count: row.reserved_count || 0,
        is_full: !!row.is_full
      });
    }
  });

  event.stations = Array.from(stationMap.values());
  return event;
}

function getEventDetailsForPublic(eventId) {
  const rows = dal.public.getEventForPublic(eventId);
  return mapEventRows(rows);
}

// Helpers -------------------------------------------------------------------

function parseLocalDate(value) {
  if (!value) return null;
  const str = String(value).replace(' ', 'T');
  const maybe = new Date(str);
  return Number.isNaN(maybe.getTime()) ? null : maybe;
}

function formatReservationRow(row) {
  const start = parseLocalDate(row.start_time);
  const end = parseLocalDate(row.end_time);
  const startStr = start ? fmt12(start.toISOString()) : row.start_time;
  const endStr = end ? fmt12(end.toISOString()) : row.end_time;
  return {
    station: row.station_name,
    start: startStr,
    end: endStr,
    block_id: row.block_id
  };
}

function buildManageUrl(token) {
  return `${APP_BASE_URL}/manage/${token}`;
}

function computeExpiryDate(days = TOKEN_TTL_DAYS) {
  if (!Number.isFinite(days) || days <= 0) return null;
  const dt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return dt.toISOString();
}

/**
 * Ensures the volunteer has a valid management token for the given event,
 * reusing an existing token when possible to avoid generating multiple emails
 * with different URLs.
 */
function issueManageToken(volunteerId, eventId) {
  const existing = dal.public.getTokenForVolunteerEvent(volunteerId, eventId);
  const token = existing && existing.token ? existing.token : crypto.randomBytes(24).toString('hex');
  const expiresAt = computeExpiryDate();
  dal.public.storeVolunteerToken(token, volunteerId, eventId, expiresAt);
  return token;
}

/**
 * Sends the transactional email letting volunteers know which slots they have
 * reserved. The same template is reused for new sign-ups and updates.
 */
async function sendConfirmationEmail({ volunteer, event, reservations, manageUrl, isUpdate }) {
  if (!volunteer.email) return;

  const subject = isUpdate
    ? `Updated volunteer schedule for ${event.name}`
    : `Your volunteer schedule for ${event.name}`;

  const listItems = reservations.length
    ? reservations.map(slot => `- ${slot.station}: ${slot.start} – ${slot.end}`).join('\n')
    : 'You currently have no reserved slots.';

  const text = `Hi ${volunteer.name || volunteer.email},\n\n` +
    `Here is your schedule for "${event.name}":\n${listItems}\n\n` +
    `Need to make a change? Manage your signup here: ${manageUrl}\n\n` +
    `If you did not request this email you can ignore it.`;

  const htmlList = reservations.length
    ? `<ul>${reservations.map(slot => `<li><strong>${slot.station}</strong>: ${slot.start} – ${slot.end}</li>`).join('')}</ul>`
    : '<p>You currently have no reserved slots.</p>';

  const html = `
    <p>Hi ${volunteer.name || volunteer.email},</p>
    <p>Here is your schedule for <strong>${event.name}</strong>:</p>
    ${htmlList}
    <p>Need to make a change? <a href="${manageUrl}">Manage your signup</a>.</p>
    <p>If you did not request this email you can ignore it.</p>
  `;

  try {
    await sendMail({
      to: volunteer.email,
      subject,
      text,
      html
    });
  } catch (err) {
    console.error('Failed to send volunteer confirmation email:', err);
  }
}

/**
 * Handles a public sign-up submission. The heavy lifting (capacity checks,
 * volunteer creation, reservation writes) lives in the DAL, keeping this
 * function focused on validation and follow-up email.
 */
async function processVolunteerSignup(volunteerData, blockIds) {
  if (!volunteerData || !volunteerData.name || !volunteerData.email || !volunteerData.phone) {
    throw createError(400, 'Name, email, and phone are required.');
  }
  if (!Array.isArray(blockIds) || blockIds.length === 0) {
    throw createError(400, 'Please select at least one time block.');
  }

  const ids = blockIds.map(id => Number(id)).filter(n => Number.isFinite(n));
  if (ids.length === 0) {
    throw createError(400, 'No valid time block IDs were submitted.');
  }

  const result = dal.public.reserveVolunteerSlots(
    { name: volunteerData.name.trim(), email: volunteerData.email.trim(), phone: volunteerData.phone.trim() },
    ids
  );

  if (!result.eventId) {
    throw createError(500, 'Unable to determine event for reservation.');
  }

  const event = dal.public.getEventBasic(result.eventId);
  if (!event) {
    throw createError(404, 'Event not found.');
  }

  const reservations = dal.public.getVolunteerReservationsForEvent(result.volunteerId, result.eventId).map(formatReservationRow);

  const token = issueManageToken(result.volunteerId, result.eventId);
  const manageUrl = buildManageUrl(token);

  await sendConfirmationEmail({
    volunteer: {
      name: volunteerData.name.trim(),
      email: volunteerData.email.trim()
    },
    event,
    reservations,
    manageUrl,
    isUpdate: result.count === 0
  });

  return {
    count: result.count,
    token,
    eventId: result.eventId,
    manageUrl,
    alreadyRegistered: result.count === 0
  };
}

/**
 * Resolves the data required to render the manage-signup page given a token
 * from the volunteer’s email.
 */
function getManageContext(token) {
  if (!token) return null;
  const tokenRow = dal.public.getVolunteerToken(token);
  if (!tokenRow) return null;

  if (tokenRow.expires_at) {
    const expiry = new Date(tokenRow.expires_at);
    if (Number.isFinite(expiry.getTime()) && expiry.getTime() < Date.now()) {
      return null;
    }
  }

  const eventRows = dal.admin.getEventById(tokenRow.event_id);
  const event = mapEventRows(eventRows);
  if (!event) return null;

  const reservations = dal.public.getVolunteerReservationsForEvent(tokenRow.volunteer_id, tokenRow.event_id)
    .map(formatReservationRow);

  return {
    token: tokenRow,
    event,
    reservations
  };
}

/**
 * Replaces the volunteer's reservations for an event with the provided block
 * IDs, reissues the management token, and sends a confirmation email.
 */
async function updateVolunteerSignup(token, blockIds) {
  const context = getManageContext(token);
  if (!context) {
    throw createError(410, 'This link has expired or is no longer valid.');
  }

  const nextIds = Array.isArray(blockIds) ? blockIds.map(id => Number(id)).filter(Number.isFinite) : [];
  dal.public.replaceVolunteerReservations(context.token.volunteer_id, context.token.event_id, nextIds);

  const updatedReservations = dal.public.getVolunteerReservationsForEvent(context.token.volunteer_id, context.token.event_id)
    .map(formatReservationRow);
  const event = dal.public.getEventBasic(context.token.event_id);

  const expiresAt = computeExpiryDate();
  dal.public.storeVolunteerToken(token, context.token.volunteer_id, context.token.event_id, expiresAt);

  await sendConfirmationEmail({
    volunteer: {
      name: context.token.volunteer_name,
      email: context.token.volunteer_email
    },
    event,
    reservations: updatedReservations,
    manageUrl: buildManageUrl(token),
    isUpdate: true
  });

  return {
    reservations: updatedReservations,
    event
  };
}

module.exports = {
  getPublicEvents,
  getEventDetailsForPublic,
  processVolunteerSignup,
  getManageContext,
  updateVolunteerSignup
};
