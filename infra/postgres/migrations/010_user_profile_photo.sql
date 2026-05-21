-- User profile photo (stored on disk; path in DB)
ALTER TABLE iam.users
    ADD COLUMN IF NOT EXISTS profile_photo_path VARCHAR(512);
