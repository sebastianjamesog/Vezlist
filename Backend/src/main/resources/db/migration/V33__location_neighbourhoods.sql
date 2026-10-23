ALTER TABLE locations DROP CONSTRAINT chk_locations_type;
ALTER TABLE locations ADD CONSTRAINT chk_locations_type CHECK (location_type IN ('PROVINCE','AREA','NEIGHBOURHOOD'));
ALTER TABLE locations DROP CONSTRAINT chk_locations_parent;
ALTER TABLE locations ADD CONSTRAINT chk_locations_parent CHECK (
    (location_type='PROVINCE' AND parent_id IS NULL)
    OR (location_type IN ('AREA','NEIGHBOURHOOD') AND parent_id IS NOT NULL)
);

CREATE FUNCTION validate_location_hierarchy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_type VARCHAR(20);
BEGIN
    IF NEW.location_type <> 'PROVINCE' THEN
        SELECT location_type INTO parent_type FROM locations WHERE id=NEW.parent_id FOR SHARE;
        IF (NEW.location_type='AREA' AND parent_type IS DISTINCT FROM 'PROVINCE')
            OR (NEW.location_type='NEIGHBOURHOOD' AND parent_type IS DISTINCT FROM 'AREA') THEN
            RAISE EXCEPTION 'Location parent has an incompatible type' USING ERRCODE='23514';
        END IF;
    END IF;
    IF TG_OP='UPDATE' AND NEW.location_type <> OLD.location_type AND EXISTS (
        SELECT 1 FROM locations child WHERE child.parent_id=OLD.id
          AND NOT ((NEW.location_type='PROVINCE' AND child.location_type='AREA')
                OR (NEW.location_type='AREA' AND child.location_type='NEIGHBOURHOOD'))
    ) THEN
        RAISE EXCEPTION 'Location type would invalidate existing children' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_locations_hierarchy BEFORE INSERT OR UPDATE OF location_type,parent_id ON locations
    FOR EACH ROW EXECUTE FUNCTION validate_location_hierarchy();
