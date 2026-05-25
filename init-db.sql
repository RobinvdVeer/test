-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create todos table
CREATE TABLE IF NOT EXISTS todos (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  status VARCHAR(50) DEFAULT 'pending',
  priority VARCHAR(50) DEFAULT 'medium',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_viewed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
CREATE INDEX IF NOT EXISTS idx_todos_user_status ON todos(user_id, status);
CREATE INDEX IF NOT EXISTS idx_todos_user_category ON todos(user_id, category);
CREATE INDEX IF NOT EXISTS idx_todos_last_viewed ON todos(user_id, last_viewed);
CREATE INDEX IF NOT EXISTS idx_todos_user_status_last_viewed ON todos(user_id, status, last_viewed);
CREATE INDEX IF NOT EXISTS idx_todos_user_category_last_viewed ON todos(user_id, category, last_viewed);
CREATE INDEX IF NOT EXISTS idx_todos_user_created_at ON todos(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_todos_user_updated_at ON todos(user_id, updated_at);
