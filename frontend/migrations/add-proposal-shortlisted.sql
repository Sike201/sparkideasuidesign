-- Add shortlisted column to hackathon_proposals
ALTER TABLE hackathon_proposals ADD COLUMN shortlisted INTEGER DEFAULT 0;
