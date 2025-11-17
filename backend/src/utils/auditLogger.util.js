import { pool } from '../DB/db.js';

/**
 * Logs an action to the audit trail.
 * @param {string} userId - The ID of the user performing the action.
 * @param {string} action - The action being performed (e.g., 'CREATE_OPD_BOOKING').
 * @param {string} [entityType] - The type of entity being acted upon (e.g., 'opd_booking').
 * @param {string} [entityId] - The ID of the entity.
 * @param {object} [details] - Any extra details to store (e.g., { patientName: 'John' }).
 */
export const logAudit = async (userId, action, entityType = null, entityId = null, details = null) => {
    try {
        await pool.query(
            `INSERT INTO crm.audit_log (user_id, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, action, entityType, entityId, details]
        );
    } catch (error) {
        // Log the error, but don't crash the main request
        console.error("CRITICAL: Failed to write to audit_log", error.message);
    }
};