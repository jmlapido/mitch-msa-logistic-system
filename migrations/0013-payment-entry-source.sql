-- Link auto-swept overpayment entries back to the entry that produced them
ALTER TABLE payment_entries ADD COLUMN source_entry_id INTEGER REFERENCES payment_entries(id);
