CREATE TABLE doctors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    location JSONB, -- GPS coordinates and address
    gps_location_link TEXT, -- GPS location link for the doctor
    contact_preferences JSONB,
    onboarding_date DATE,
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'inactive', 'churned'
    last_meeting TIMESTAMP,
    assigned_agent_id_offline UUID REFERENCES users(id),
    assigned_agent_id_online UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE doctor_meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID REFERENCES doctors(id),
    agent_id UUID REFERENCES users(id),
    meeting_type VARCHAR(20) NOT NULL, -- 'physical', 'virtual', 'call'
    duration INTEGER, -- Duration in minutes
    location JSONB, -- GPS coordinates, address
    gps_location_link TEXT,
    meeting_notes TEXT,
    photos JSONB, -- Array of photo URLs
    gps_verified BOOLEAN DEFAULT false,
    meeting_summary VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
