-- Migration: create export_jobs table to enqueue background exports
CREATE TABLE IF NOT EXISTS export_jobs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  q VARCHAR(255) DEFAULT NULL,
  params TEXT DEFAULT NULL,
  file_path VARCHAR(1024) DEFAULT NULL,
  result_message VARCHAR(255) DEFAULT NULL,
  date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_modification DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- For portability we avoid the `IF NOT EXISTS` clause here; the
-- migration runner will create the index only if it doesn't already exist.
CREATE INDEX idx_export_jobs_status ON export_jobs(status);
