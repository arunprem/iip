-- Suspect & dossier persistence (intelligence domain)

CREATE TABLE IF NOT EXISTS intelligence.suspects (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    criminal_name   VARCHAR(255) NOT NULL,
    alias_name      VARCHAR(255),
    gender          VARCHAR(50),
    fathers_name    VARCHAR(255),
    date_of_birth   DATE,
    age             INTEGER,
    year_of_birth   INTEGER,
    place_of_birth  VARCHAR(255),
    religion        VARCHAR(100),
    category        VARCHAR(50),
    created_by      UUID NOT NULL REFERENCES iam.users(id),
    office_id       UUID REFERENCES iam.offices(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suspects_criminal_name
    ON intelligence.suspects (lower(criminal_name));

CREATE TABLE IF NOT EXISTS intelligence.suspect_dossiers (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    suspect_id        UUID NOT NULL REFERENCES intelligence.suspects(id) ON DELETE CASCADE,
    dossier_draft_id  UUID,
    status            VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED'
                      CHECK (status IN ('SUBMITTED', 'ARCHIVED')),
    submitted_by      UUID NOT NULL REFERENCES iam.users(id),
    office_id         UUID REFERENCES iam.offices(id),
    submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suspect_dossiers_suspect
    ON intelligence.suspect_dossiers (suspect_id);

CREATE TABLE IF NOT EXISTS intelligence.suspect_addresses (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    suspect_id        UUID NOT NULL REFERENCES intelligence.suspects(id) ON DELETE CASCADE,
    is_permanent      BOOLEAN NOT NULL DEFAULT TRUE,
    house_no          VARCHAR(100),
    house_name        VARCHAR(255),
    street_name       VARCHAR(255),
    locality          VARCHAR(255),
    tehsil            VARCHAR(255),
    village_town_city VARCHAR(255),
    pincode           VARCHAR(20),
    latitude          NUMERIC(10, 7),
    longitude         NUMERIC(10, 7),
    country           VARCHAR(100),
    state             VARCHAR(100),
    district          VARCHAR(100),
    police_station    VARCHAR(255),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intelligence.suspect_contacts (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    suspect_id    UUID NOT NULL REFERENCES intelligence.suspects(id) ON DELETE CASCADE,
    contact_type  VARCHAR(20) NOT NULL
                  CHECK (contact_type IN ('MOBILE', 'LANDLINE', 'EMAILID')),
    value         VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intelligence.suspect_social_accounts (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    suspect_id    UUID NOT NULL REFERENCES intelligence.suspects(id) ON DELETE CASCADE,
    platform      VARCHAR(50) NOT NULL,
    details       TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intelligence.suspect_relatives (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    suspect_id    UUID NOT NULL REFERENCES intelligence.suspects(id) ON DELETE CASCADE,
    name          VARCHAR(255) NOT NULL,
    relation      VARCHAR(100),
    gender        VARCHAR(50),
    occupation    VARCHAR(255),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intelligence.suspect_photos (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    suspect_id      UUID NOT NULL REFERENCES intelligence.suspects(id) ON DELETE CASCADE,
    dossier_id      UUID NOT NULL REFERENCES intelligence.suspect_dossiers(id) ON DELETE CASCADE,
    photo_id        UUID NOT NULL,
    pose_type       VARCHAR(30) NOT NULL,
    storage_key     VARCHAR(512) NOT NULL,
    face_id         UUID,
    detected_pose   VARCHAR(30),
    face_detected   BOOLEAN NOT NULL DEFAULT FALSE,
    face_count      INTEGER,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (dossier_id, photo_id)
);

CREATE INDEX IF NOT EXISTS idx_suspect_photos_suspect
    ON intelligence.suspect_photos (suspect_id);

CREATE INDEX IF NOT EXISTS idx_suspect_photos_face
    ON intelligence.suspect_photos (face_id)
    WHERE face_id IS NOT NULL;
