-- Migration 011 — Add GST registration fields to clients
--
-- gst_registered      : boolean — persisted from ABN lookup at client creation
-- gst_registered_from : date    — GST registration date from ABR
--
-- Both are nullable: existing clients and clients without ABN lookup data
-- remain valid. BAS workpaper header displays these when present.

ALTER TABLE clients
    ADD COLUMN gst_registered      BOOLEAN,
    ADD COLUMN gst_registered_from DATE;

COMMENT ON COLUMN clients.gst_registered      IS 'Whether the entity is GST registered — sourced from ABR at client creation';
COMMENT ON COLUMN clients.gst_registered_from IS 'GST registration effective date — sourced from ABR at client creation';
