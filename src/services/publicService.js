// src/services/publicService.js
const crypto = require('crypto');
const createError = require('http-errors');
const dal = require('../db/dal');
const { fmt12 } = require('../views/helpers');
const { sendMail } = require('../utils/mailer');
const { getBranding } = require('../config/branding');

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
    signup_mode: rows[0].signup_mode || 'schedule',
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
      const notesRaw = (row.notes_csv ? String(row.notes_csv) : '').split('||').map(s => s.trim()).filter(Boolean);
      const notesWithNamesRaw = (row.notes_with_names_csv ? String(row.notes_with_names_csv) : '').split('||').map(s => s.trim()).filter(Boolean);
      function toShortName(full) {
        if (!full) return '';
        const parts = String(full).trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return '';
        const first = parts[0];
        const last = parts.length > 1 ? parts[parts.length - 1].charAt(0).toUpperCase() + '.' : '';
        return last ? `${first} ${last}` : first;
      }
      // Prefer paired (note::name) when available; fall back to notes only
      const notes = notesWithNamesRaw.length
        ? notesWithNamesRaw.map(pair => {
            const idx = pair.indexOf('::');
            if (idx === -1) return { text: pair, by: '' };
            const text = pair.slice(0, idx).trim();
            const name = pair.slice(idx + 2).trim();
            return { text, by: toShortName(name) };
          })
        : notesRaw.map(text => ({ text, by: '' }));
      stationMap.get(row.station_id).time_blocks.push({
        block_id: row.block_id,
        start_time: row.start_time,
        end_time: row.end_time,
        capacity_needed: typeof row.capacity_needed !== 'undefined' ? row.capacity_needed : row.capacity,
        reserved_count: row.reserved_count || 0,
        servings_min: row.servings_min,
        servings_max: row.servings_max,
        title: row.title || '',
        is_full: !!row.is_full,
        dish_notes: notes
      });
    }
  });

  event.stations = Array.from(stationMap.values());
  return event;
}

function normalizeDishNote(value) {
  const s = String(value || '').trim();
  // Guard against accidental leading commas (e.g., ", Lasagna")
  return s.replace(/^\s*,\s*/, '');
}

function getEventDetailsForPublic(eventId) {
  const rows = dal.public.getEventForPublic(eventId);
  const event = mapEventRows(rows);
  return enrichPotluckDishNotes(event, eventId);
}

/**
 * Admin-only preview: load event details even when not published.
 * Uses admin DAL join and maps to the public structure so the same template renders.
 */
function getEventDetailsForPreview(eventId) {
  const rows = dal.admin.getEventById(eventId);
  const event = mapEventRows(rows);
  return event;
}

function enrichPotluckDishNotes(event, eventId) {
  try {
    if (event && String(event.signup_mode) === 'potluck') {
      const pairs = dal.public.getDishNotesWithNamesForEvent(Number(eventId));
      const byBlock = new Map();
      pairs.forEach(p => {
        const list = byBlock.get(p.block_id) || [];
        const name = (p.name || '').trim();
        const parts = name.split(/\s+/).filter(Boolean);
        const short = parts.length
          ? parts[0] + (parts.length > 1 ? ' ' + parts[parts.length - 1].charAt(0).toUpperCase() + '.' : '')
          : '';
        list.push({ text: (p.note || '').trim(), by: short });
        byBlock.set(p.block_id, list);
      });
      (event.stations || []).forEach(st => {
        (st.time_blocks || []).forEach(tb => {
          const withNames = byBlock.get(tb.block_id);
          if (withNames && withNames.length) tb.dish_notes = withNames;
        });
      });
    }
  } catch (e) {
    console.warn('[PublicService] Failed to enrich dish notes with names:', e && e.message);
  }
  return event;
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
    // If this is a potluck item (title present), use it as the primary line
    start: row.title ? row.title : startStr,
    end: row.title ? '' : endStr,
    note: row.note || '',
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
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = computeExpiryDate();
  dal.public.storeVolunteerToken(token, volunteerId, eventId, expiresAt);
  return token;
}

/**
 * Sends the transactional email letting volunteers know which opportunities they have
 * reserved. The same template is reused for new sign-ups and updates.
 */
async function sendConfirmationEmail({ volunteer, event, reservations, manageUrl, isUpdate }) {
  if (!volunteer.email) return;

  const branding = getBranding();
  const supportName = branding.supportContactName || branding.orgName || 'Our team';
  const supportEmail = branding.supportContactEmail;
  const supportPhone = branding.supportContactPhone;
  const supportContactHtml = (() => {
    if (!supportEmail && !supportPhone) {
      return 'Reply to this email and we will help you.';
    }
    const emailHtml = supportEmail
      ? ` at <a href="mailto:${supportEmail}" style="color:#2563eb; font-weight:600;">${supportEmail}</a>`
      : '';
    const phoneHtml = supportPhone
      ? `${supportEmail ? ' or call ' : ' at '}<a href="tel:${supportPhone.replace(/\D+/g, '')}" style="color:#2563eb; font-weight:600;">${supportPhone}</a>`
      : '';
    return `Reach out${emailHtml}${phoneHtml}.`;
  })();

  const isPotluckEmail = String(event && event.signup_mode || '').toLowerCase() === 'potluck';
  const subject = isPotluckEmail
    ? (isUpdate ? `Updated potluck signup for ${event.name}` : `Your potluck signup for ${event.name}`)
    : (isUpdate ? `Updated volunteer schedule for ${event.name}` : `Your volunteer schedule for ${event.name}`);

  const listItems = reservations.length
    ? reservations.map(slot => {
        const core = `${slot.station}: ${slot.start}${slot.end ? ' – ' + slot.end : ''}`;
        const dish = slot.note && slot.note.trim() ? ` (Dish: ${slot.note.trim()})` : '';
        return `• ${core}${dish}`;
      }).join('\n')
    : 'You currently have no reserved opportunities.';

  const textLines = (function(){
    const lines = [`Hi ${volunteer.name || volunteer.email},`, ''];
    if (isPotluckEmail) {
      lines.push(`Thank you for contributing to the potluck for ${event.name}! We\'re excited to see what you\'re bringing.`);
      lines.push('');
      lines.push('Here are the items you\'ve signed up to bring:');
    } else {
      lines.push(`Thank you so much for serving with us at ${event.name}! We are grateful for your time and heart to help our community.`);
      lines.push('');
      lines.push('Here is your schedule:');
    }
    lines.push(listItems, '', `Need to make a change? Manage your signup here: ${manageUrl}`, '',
      'If you have any questions or run into trouble, reach out to us:');
    const contactLines = [];
    if (supportEmail) contactLines.push(`Email: ${supportEmail}`);
    if (supportPhone) contactLines.push(`Phone: ${supportPhone}`);
    if (contactLines.length) {
      lines.push(...contactLines);
    } else {
      lines.push('Reply to this email and we will help you.');
    }
    lines.push('', 'With gratitude,', supportName || 'Volunteer Team', '', 'If you did not request this email you can ignore it.');
    return lines;
  })();

  const text = textLines.join('\n');

  const htmlList = reservations.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:16px 0 24px;">
          ${reservations.map((slot, index) => `
            <tr>
              <td align="left" valign="top" style="padding:0 0 12px 0;">
                <!--[if mso]>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td bgcolor="#f0f4ff" style="padding:12px 16px;">
                <![endif]-->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
                  <tr>
                    <td bgcolor="#f0f4ff" style="background-color:#f0f4ff; border-radius:12px; padding:12px 16px; font-family:'Segoe UI', Arial, sans-serif;">
                      <p style="margin:0 0 4px; font-weight:600; color:#1d4ed8; font-size:15px;">${slot.station}</p>
                      <p style="margin:0; color:#475569; font-size:14px;">${slot.start}${slot.end ? ' – ' + slot.end : ''}${slot.note ? ' • Dish: ' + slot.note : ''}</p>
                    </td>
                  </tr>
                </table>
                <!--[if mso]>
                      </td>
                    </tr>
                  </table>
                <![endif]-->
              </td>
            </tr>
            ${index < reservations.length - 1 ? '<tr><td height="4" style="font-size:0; line-height:0;">&nbsp;</td></tr>' : ''}
          `).join('')}
        </table>`
    : '<p style="margin:16px 0 24px; color:#475569; font-family:\'Segoe UI\', Arial, sans-serif;">You currently have no reserved opportunities.</p>';

  const html = `<!DOCTYPE html>
    <html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta http-equiv="X-UA-Compatible" content="IE=edge" />
        <title>Volunteer Schedule</title>
        <style>
          table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
          a { text-decoration:none; }
        </style>
        <!--[if mso]>
        <style type="text/css">
          body, table, td { font-family: 'Segoe UI', Arial, sans-serif !important; }
        </style>
        <![endif]-->
      </head>
      <body style="margin:0; padding:0; background-color:#dfe4f3;">
        <div role="article" aria-roledescription="email" lang="en" style="background-color:#dfe4f3;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#dfe4f3; margin:0;">
            <tr>
              <td align="center" style="padding:32px 16px;">
                <!--[if mso]>
                  <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td>
                <![endif]-->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px; background-color:#ffffff; border-radius:18px; box-shadow:0 20px 38px rgba(15,23,42,0.12); overflow:hidden;" bgcolor="#ffffff">
                  <tr>
                    <td bgcolor="#2563eb" style="background-color:#2563eb; padding:28px 32px; color:#ffffff; font-family:'Segoe UI', Arial, sans-serif;">
                      <h1 style="margin:0; font-size:24px; font-weight:700; letter-spacing:-0.01em;">${isPotluckEmail ? 'Thanks for contributing!' : 'Thank you for serving!'}</h1>
                      <p style="margin:12px 0 0; font-size:15px; line-height:1.6; opacity:0.92;">${isPotluckEmail ? `We\'re excited for your contribution to <strong>${event.name}</strong>.` : `We're grateful to have you on the team for <strong>${event.name}</strong>.`}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:32px; font-family:'Segoe UI', Arial, sans-serif; color:#0f172a;">
                      <p style="margin:0 0 16px; font-size:16px;">Hi ${volunteer.name || volunteer.email},</p>
                      <p style="margin:0 0 16px; color:#475569; line-height:1.7;">${isPotluckEmail ? 'Below are the potluck items you\'ve signed up to bring.' : `Thank you for lending your time and heart to serve. Below you'll find your volunteer schedule details.`}</p>
                      ${htmlList}
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:32px auto 28px;">
                        <tr>
                          <td align="center" role="presentation">
                            <!--[if mso]>
                              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${manageUrl}" style="height:48px; v-text-anchor:middle; width:240px;" arcsize="50%" stroke="f" fillcolor="#2563eb">
                                <w:anchorlock/>
                                <center style="color:#ffffff; font-family:'Segoe UI', Arial, sans-serif; font-size:15px; font-weight:600;">
                                  Manage Your Signup
                                </center>
                              </v:roundrect>
                            <![endif]-->
                            <!--[if !mso]><!-- -->
                              <a href="${manageUrl}" style="display:inline-block; background-color:#2563eb; color:#ffffff; padding:14px 28px; font-size:15px; border-radius:999px; font-weight:600; text-decoration:none; font-family:'Segoe UI', Arial, sans-serif;" target="_blank" rel="noopener">
                                Manage Your Signup
                              </a>
                            <!--<![endif]-->
                          </td>
                        </tr>
                      </table>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid rgba(15,23,42,0.08); margin-top:24px; padding-top:24px;">
                        <tr>
                          <td style="font-family:'Segoe UI', Arial, sans-serif;">
                            <p style="margin:0 0 12px; font-weight:600; color:#0f172a;">Need a hand?</p>
                            <p style="margin:0; color:#475569; line-height:1.7;">Our team is here to help with any changes or questions. ${supportContactHtml}</p>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:32px 0 0; color:#475569; font-family:'Segoe UI', Arial, sans-serif;">With gratitude,<br /><strong>${supportName || 'Volunteer Team'}</strong></p>
                    </td>
                  </tr>
                  <tr>
                    <td bgcolor="#f3f6fb" style="background-color:#f3f6fb; padding:18px 32px; text-align:center; color:#94a3b8; font-size:13px; font-family:'Segoe UI', Arial, sans-serif;">
                      If you did not request this email you can ignore it.
                    </td>
                  </tr>
                </table>
                <!--[if mso]>
                      </td>
                    </tr>
                  </table>
                <![endif]-->
              </td>
            </tr>
          </table>
        </div>
      </body>
    </html>`;

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
async function processVolunteerSignup(volunteerData, blockIds, notesMap) {
  if (!volunteerData || !volunteerData.name || !volunteerData.email || !volunteerData.phone) {
    throw createError(400, 'Name, email, and phone are required.');
  }
  if (!Array.isArray(blockIds) || blockIds.length === 0) {
    throw createError(400, 'Please select at least one time block.');
  }

  const ids = Array.from(new Set(blockIds.map(id => Number(id)).filter(Number.isFinite)));
  if (ids.length === 0) {
    throw createError(400, 'No valid time block IDs were submitted.');
  }

  // Normalize dish notes to map keyed by numeric block_id
  const normalizedNotes = {};
  if (Array.isArray(notesMap)) {
    // Some browsers/servers parse bracketed keys into arrays: align by index with ids
    notesMap.forEach((val, idx) => {
      const bid = Number(ids[idx]);
      if (Number.isFinite(bid)) normalizedNotes[bid] = normalizeDishNote(val);
    });
  } else if (notesMap && typeof notesMap === 'object') {
    Object.keys(notesMap).forEach(key => {
      const bid = Number(key);
      if (Number.isFinite(bid)) normalizedNotes[bid] = normalizeDishNote(notesMap[key]);
    });
  }

  // Validation: if event is potluck and any selected block is titled "Other",
  // require a dish name (note)
  const blocksInfo = dal.public.getBlocksInfo(ids);
  let eventIdFromBlocks = (blocksInfo && blocksInfo[0] && blocksInfo[0].event_id) || null;
  const eventBasic = eventIdFromBlocks ? dal.public.getEventBasic(eventIdFromBlocks) : null;
  const isPotluck = !!(eventBasic && String(eventBasic.signup_mode) === 'potluck');
  if (isPotluck) {
    const missing = blocksInfo.filter(b => !String(normalizedNotes[b.block_id] || '').trim().length);
    if (missing.length) throw createError(400, 'Please enter a dish name for each selected item.');
  }

  const result = dal.public.reserveVolunteerSlots(
    { name: volunteerData.name.trim(), email: volunteerData.email.trim(), phone: volunteerData.phone.trim() },
    ids,
    normalizedNotes
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
  const event = enrichPotluckDishNotes(mapEventRows(eventRows), tokenRow.event_id);
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
async function updateVolunteerSignup(token, blockIds, notesMap) {
  const context = getManageContext(token);
  if (!context) {
    throw createError(410, 'This link has expired or is no longer valid.');
  }

  const nextIds = Array.isArray(blockIds) ? blockIds.map(id => Number(id)).filter(Number.isFinite) : [];
  // Normalize dish notes for saving/validation
  const normalizedNotes = {};
  if (Array.isArray(notesMap)) {
    notesMap.forEach((val, idx) => {
      const bid = Number(nextIds[idx]);
      if (Number.isFinite(bid)) normalizedNotes[bid] = normalizeDishNote(val);
    });
  } else if (notesMap && typeof notesMap === 'object') {
    Object.keys(notesMap).forEach(key => {
      const bid = Number(key);
      if (Number.isFinite(bid)) normalizedNotes[bid] = normalizeDishNote(notesMap[key]);
    });
  }

  // Validate "Other" requires dish for potluck
  const blocksInfo = dal.public.getBlocksInfo(nextIds);
  const isPotluck = String(context.event.signup_mode || '') === 'potluck';
  if (isPotluck) {
    const missing = blocksInfo.filter(b => !String(normalizedNotes[b.block_id] || '').trim().length);
    if (missing.length) throw createError(400, 'Please enter a dish name for each selected item.');
  }

  dal.public.replaceVolunteerReservations(context.token.volunteer_id, context.token.event_id, nextIds, normalizedNotes);

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

/**
 * Email a fresh manage link to the provided email for the given event, if a
 * volunteer record exists. We always generate/store a token so returning users
 * can manage even if they currently have no reservations.
 */
async function sendManageReminder(email, eventId) {
  const inputEmail = String(email).trim();
  const v = dal.public.getVolunteerByEmail(inputEmail);
  const event = dal.public.getEventBasic(Number(eventId));
  if (!event || !v) {
    return; // silent: controller shows generic success
  }
  // If we matched a previously-normalized Gmail record, promote it to the exact email provided now
  if (v && v._matchedBy === 'gmail_canonical_alt' && v.email !== inputEmail) {
    try { dal.admin.updateVolunteer(v.volunteer_id, v.name, inputEmail, v.phone_number || ''); } catch (_) {}
  }
  const token = issueManageToken(v.volunteer_id, Number(eventId));
  const manageUrl = buildManageUrl(token);
  const subject = `Manage your signup for ${event.name}`;
  const text = `Use this link to view or edit your selections for ${event.name}:\n\n${manageUrl}\n\nIf you did not request this, you can ignore this email.`;
  const html = `<!DOCTYPE html>
    <html>
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${subject}</title>
      </head>
      <body style="margin:0;padding:0;background:#f3f6fb;color:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
        <div style="max-width:680px;margin:0 auto;padding:24px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#ffffff;border:1px solid rgba(15,23,42,0.12);border-radius:16px;box-shadow:0 6px 18px rgba(15,23,42,0.08);">
            <tr>
              <td style="padding:28px 28px 16px 28px;">
                <h1 style="margin:0 0 8px 0;font-size:22px;letter-spacing:-0.01em;">Manage your signup</h1>
                <p style="margin:0;color:#475569;">Use the button below to view or edit your selections for <strong>${event.name}</strong>.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 28px 28px;">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${manageUrl}" style="height:46px;v-text-anchor:middle;width:260px;" arcsize="50%" stroke="f" fillcolor="#2563eb">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:600;">Open manage page</center>
                </v:roundrect>
                <![endif]-->
                <a href="${manageUrl}" target="_blank" rel="noopener" style="display:inline-block;background:#2563eb;color:#ffffff;padding:13px 22px;border-radius:999px;font-weight:600;text-decoration:none;font-size:15px;">Open manage page</a>
                <p style="margin:16px 0 0 0;color:#64748b;font-size:14px;">If the button doesn’t work, copy and paste this URL into your browser:</p>
                <p style="margin:6px 0 0 0;word-break:break-all;color:#1d4ed8;font-size:14px;"><a href="${manageUrl}" style="color:#1d4ed8;text-decoration:none;">${manageUrl}</a></p>
                <p style="margin:18px 0 0 0;color:#64748b;font-size:13px;">If you did not request this, you can ignore this email.</p>
              </td>
            </tr>
          </table>
        </div>
      </body>
    </html>`;
  try {
    await sendMail({ to: v.email, subject, text, html });
  } catch (err) {
    console.error('Failed to send manage reminder email:', err);
  }
}

module.exports = {
  getPublicEvents,
  getEventDetailsForPublic,
  getEventDetailsForPreview,
  processVolunteerSignup,
  getManageContext,
  updateVolunteerSignup,
  sendManageReminder
};
