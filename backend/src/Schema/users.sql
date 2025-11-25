CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255),
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    gender VARCHAR(20),
    phone VARCHAR(20) UNIQUE NOT NULL,
    secondary_phone VARCHAR(20) ,
    role VARCHAR(50) NOT NULL DEFAULT 'agent', -- 'super_admin', 'team_lead', 'operations', 'online_sales', 'offline_sales'
    team_id UUID, 
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    team_lead_id UUID REFERENCES users(id),
    territory JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE users
ADD CONSTRAINT fk_users_team_id
FOREIGN KEY (team_id) REFERENCES teams(id);