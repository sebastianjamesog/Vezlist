-- Demo publication never represents a real payment.
ALTER TABLE stories ADD COLUMN demo_purchase boolean NOT NULL DEFAULT false;
