SET search_path=crm,public;

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES crm.users(id),
    action VARCHAR(100) NOT NULL, -- e.g., 'CREATE_PATIENT', 'UPDATE_DOCTOR', 'LOGIN_FAILURE'
    entity_type VARCHAR(50), -- e.g., 'patient_lead', 'doctor', 'user'
    entity_id UUID,
    details JSONB, -- Store old and new values, IP address, etc.
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for searching by user or entity
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);