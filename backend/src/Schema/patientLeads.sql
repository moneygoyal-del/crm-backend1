CREATE TABLE patient_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_name VARCHAR(100) NOT NULL,
    patient_phone VARCHAR(20) NOT NULL,
    age INTEGER,
    gender VARCHAR(10),
    medical_condition TEXT,
    lead_source VARCHAR(50) NOT NULL, -- 'meta_ads', 'inbound_call', 'doctor_referral', 'whatsapp', 'website', 'walk_in'
    lead_quality_score DECIMAL(3,2),
    assigned_agent_id UUID REFERENCES users(id),
    current_disposition VARCHAR(50), -- 'new', 'contacted', 'interested', 'not_interested', 'callback_scheduled', 'converted_to_opd', 'lost'
    priority_level VARCHAR(20) DEFAULT 'medium', -- 'high', 'medium', 'low'
    urgency_level VARCHAR(20) DEFAULT 'normal', -- 'emergency', 'urgent', 'normal', 'routine'
    patient_location VARCHAR(255),
    payer JSONB, -- Can be PMJAY, CMRelief Fund, Cash, TPA
    source_metadata JSONB, -- Form data, ad details, etc.
    last_interaction_date TIMESTAMP,
    next_follow_up_date TIMESTAMP,
    total_interactions INTEGER DEFAULT 0,
    is_converted_to_opd BOOLEAN DEFAULT false,
    converted_to_opd_at TIMESTAMP,
    lost_reason TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);


CREATE TABLE opd_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_lead_id UUID REFERENCES patient_leads(id),
    booking_reference VARCHAR(50) NOT NULL,
    patient_name VARCHAR(100) NOT NULL,
    patient_phone VARCHAR(20) NOT NULL,
    age INTEGER,
    gender VARCHAR(10),
    medical_condition TEXT NOT NULL,
    hospital_name VARCHAR(300) NOT NULL,
    department VARCHAR(100),
    appointment_date DATE ,
    appointment_time TIME ,
    booking_status VARCHAR(30) DEFAULT 'confirmed', -- 'confirmed', 'rescheduled', 'cancelled', 'completed', 'no_show'
    current_disposition VARCHAR(50), -- 'opd_booked', 'pre_consultation', 'consultation_done', 'treatment_planned', 'procedure_scheduled', 'recovery', 'completed'
    assigned_care_coordinator_id UUID REFERENCES users(id),
    estimated_case_value DECIMAL(10,2),
    actual_case_value DECIMAL(10,2),
    payment_mode VARCHAR(30), -- 'cash', 'insurance', 'card', 'upi', 'mixed'
    booking_notes TEXT,
    special_requirements JSONB, -- wheelchair, interpreter, etc.
    created_by_agent_id UUID REFERENCES users(id),
    last_interaction_date TIMESTAMP,
    next_follow_up_date TIMESTAMP,
    source VARCHAR(50), -- 'Doctor Referral', 'Patient Referral', 'Asha', 'Meta Leads', 'Self'
    referee_id UUID, -- References doctor or patient
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
