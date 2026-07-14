-- Add salt column for improved password hashing
ALTER TABLE users ADD COLUMN IF NOT EXISTS salt VARCHAR(255);

-- Migrate existing passwords: set default salt for users without one
UPDATE users SET salt = 'default-salt-migration' WHERE salt IS NULL;
