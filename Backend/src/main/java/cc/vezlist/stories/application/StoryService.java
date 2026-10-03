package cc.vezlist.stories.application;

import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import cc.vezlist.media.storage.ObjectStorage;
import cc.vezlist.admin.application.AdminAuditService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class StoryService {
    public record Plan(UUID id, String name, BigDecimal price, String currency, int storyCount,
                       boolean enabled, int sortOrder, long version) {}
    public record Plans(List<Plan> items, boolean paymentAvailable, boolean demoPurchaseAvailable) {}
    public record Story(UUID id, UUID ownerId, String creatorName, String avatarUrl, String mediaUrl,
                        String mediaType, String status, Instant createdAt, Instant publishedAt, Instant expiresAt) {}
    public record Stories(List<Story> items) {}
    public record MyStories(List<Story> items, int credits) {}
    public record Upload(UUID id, String uploadUrl, Map<String, String> headers) {}
    private record UploadRow(UUID id, String objectKey, String contentType, long sizeBytes, String checksum, String status, Instant uploadExpiresAt) {}
    private static final Set<String> TYPES = Set.of("image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm");
    private static final String STORY_SELECT = "SELECT s.*, u.display_name, up.avatar_url FROM stories s"
            + " JOIN app_users u ON u.id = s.owner_id LEFT JOIN user_profiles up ON up.user_id = s.owner_id";
    private final JdbcTemplate jdbc;
    private final ObjectStorage storage;
    private final TransactionTemplate tx;
    private final AdminAuditService audit;
    private final boolean demoPurchasesEnabled;

    public StoryService(JdbcTemplate jdbc, ObjectStorage storage, PlatformTransactionManager transactions, AdminAuditService audit,
                        @Value("${vezlist.stories.demo-purchases-enabled:false}") boolean demoPurchasesEnabled) {
        this.jdbc = jdbc;
        this.storage = storage;
        this.tx = new TransactionTemplate(transactions);
        this.audit = audit;
        this.demoPurchasesEnabled = demoPurchasesEnabled;
    }

    public Plans plans(boolean admin, UUID actor) {
        if (admin) requireAdmin(actor);
        return new Plans(jdbc.query("SELECT * FROM story_plans" + (admin ? "" : " WHERE enabled = true")
                + " ORDER BY sort_order, name, id", this::mapPlan), false, demoPurchasesEnabled);
    }

    public Plan savePlan(UUID actor, UUID id, String name, BigDecimal price, String currency,
                         int storyCount, boolean enabled, int sortOrder, Long version) {
        return tx.execute(status -> {
            requireAdmin(actor);
            if (!Set.of("CAD", "USD", "EUR", "GBP").contains(currency))
                fail(HttpStatus.BAD_REQUEST, "STORY_PLAN_INVALID", "Choose CAD, USD, EUR or GBP.");
            UUID savedId = id == null ? UUID.randomUUID() : id;
            if (id == null) {
                jdbc.update("INSERT INTO story_plans(id,name,price,currency,story_count,enabled,sort_order) VALUES (?,?,?,?,?,?,?)",
                        savedId, name.strip(), price, currency, storyCount, enabled, sortOrder);
            } else {
                if (version == null) fail(HttpStatus.BAD_REQUEST, "STORY_PLAN_INVALID", "The plan version is required.");
                int changed = jdbc.update("UPDATE story_plans SET name=?,price=?,currency=?,story_count=?,enabled=?,sort_order=?,"
                        + "version=version+1,updated_at=now() WHERE id=? AND version=?",
                        name.strip(), price, currency, storyCount, enabled, sortOrder, id, version);
                if (changed == 0) fail(HttpStatus.CONFLICT, "STORY_PLAN_CHANGED", "This pack changed. Reload it before saving.");
            }
            audit.record(actor, id == null ? "STORY_PLAN_CREATED" : "STORY_PLAN_UPDATED", "STORY_PLAN", savedId.toString(),
                    name.strip() + "; " + price.toPlainString() + " " + currency + "; stories=" + storyCount + "; enabled=" + enabled);
            return jdbc.queryForObject("SELECT * FROM story_plans WHERE id=?", this::mapPlan, savedId);
        });
    }

    public Upload upload(UUID owner, String filename, String type, long size, String checksum) {
        requireCreator(owner);
        if (!TYPES.contains(type)) fail(HttpStatus.BAD_REQUEST, "STORY_MEDIA_INVALID", "Choose a JPEG, PNG, WebP, MP4 or WebM file.");
        long max = type.startsWith("image/") ? 10L * 1024 * 1024 : 50L * 1024 * 1024;
        if (size < 1 || size > max) fail(HttpStatus.BAD_REQUEST, "STORY_MEDIA_INVALID", "Photos can be up to 10 MB; videos up to 50 MB.");
        List<String> abandoned = tx.execute(status -> {
            requireCreator(owner);
            return jdbc.query("UPDATE stories SET status='DELETED' WHERE owner_id=? AND status='UPLOADING'"
                    + " AND upload_expires_at<=now() RETURNING object_key", (rs, n) -> rs.getString(1), owner);
        });
        if (abandoned != null) abandoned.forEach(this::deleteQuietly);
        UUID id = UUID.randomUUID();
        String key = "story-uploads/" + owner + "/" + id;
        ObjectStorage.UploadTarget target = storage.authorizeUpload(key, type, size, checksum.toLowerCase());
        tx.executeWithoutResult(status -> {
            requireCreator(owner, true);
            // Bound outstanding drafts per creator; abandoned uploads do not consume unlimited rows.
            Integer drafts = jdbc.queryForObject("SELECT count(*) FROM stories WHERE owner_id=? AND status IN ('UPLOADING','READY')",
                    Integer.class, owner);
            if (drafts != null && drafts >= 30) fail(HttpStatus.CONFLICT, "STORY_DRAFT_LIMIT", "Remove an existing draft before uploading another story.");
            jdbc.update("INSERT INTO stories(id,owner_id,object_key,content_type,size_bytes,checksum_sha256,media_type,upload_expires_at) VALUES (?,?,?,?,?,?,?,?)",
                    id, owner, key, type, size, checksum.toLowerCase(), type.startsWith("image/") ? "IMAGE" : "VIDEO", Timestamp.from(target.expiresAt()));
        });
        return new Upload(id, target.url().toString(), target.headers());
    }

    public Story complete(UUID owner, UUID id) {
        requireCreator(owner);
        UploadRow row = uploadRow(owner, id);
        if (Set.of("READY", "PUBLISHED").contains(row.status())) return mineOne(owner, id);
        if (!"UPLOADING".equals(row.status())) fail(HttpStatus.CONFLICT, "STORY_STATE_INVALID", "This upload is no longer available.");
        if (!row.uploadExpiresAt().isAfter(Instant.now())) fail(HttpStatus.CONFLICT, "STORY_UPLOAD_EXPIRED", "This upload expired. Please select the file again.");
        // Network reads and hashing deliberately happen outside a database transaction.
        byte[] bytes;
        try {
            ObjectStorage.StoredObject object = storage.describe(row.objectKey());
            if (object.sizeBytes() != row.sizeBytes()) invalidMedia("The uploaded file size does not match.");
            try (InputStream input = storage.open(row.objectKey())) {
                bytes = input.readNBytes(Math.toIntExact(row.sizeBytes() + 1));
            }
            if (bytes.length != row.sizeBytes()) invalidMedia("The uploaded file is incomplete.");
            String actualHash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
            if (!actualHash.equals(row.checksum())) invalidMedia("The uploaded file checksum does not match.");
            if (!matchesType(bytes, row.contentType())) invalidMedia("The file contents do not match the selected media type.");
        } catch (StoryException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new StoryException(HttpStatus.BAD_REQUEST, "STORY_UPLOAD_INCOMPLETE", "The uploaded file could not be read. Try uploading it again.");
        }
        // A separate key prevents reuse of the upload URL from replacing validated/published media.
        String readyKey = "stories/" + owner + "/" + id + "/" + UUID.randomUUID();
        storage.store(readyKey, row.contentType(), bytes);
        boolean attached;
        try {
            attached = Boolean.TRUE.equals(tx.execute(status -> {
                requireCreator(owner);
                return jdbc.update("UPDATE stories SET object_key=?,status='READY' WHERE id=? AND owner_id=? AND status='UPLOADING'",
                        readyKey, id, owner) == 1;
            }));
        } catch (RuntimeException exception) {
            deleteQuietly(readyKey);
            throw exception;
        }
        if (!attached) deleteQuietly(readyKey);
        deleteQuietly(row.objectKey());
        return mineOne(owner, id);
    }

    public Story publish(UUID owner, UUID id, UUID planId, Long version, boolean useCredit, boolean demoPurchase) {
        tx.executeWithoutResult(status -> {
            requireCreator(owner);
            List<String> rows = jdbc.query("SELECT status FROM stories WHERE id=? AND owner_id=? FOR UPDATE",
                    (rs, n) -> rs.getString(1), id, owner);
            if (rows.isEmpty()) notFound();
            if ("PUBLISHED".equals(rows.getFirst())) return; // Retrying must never grant/consume credits twice.
            if (!"READY".equals(rows.getFirst())) fail(HttpStatus.CONFLICT, "STORY_NOT_READY", "Finish uploading this story before publishing.");
            jdbc.update("INSERT INTO story_credits(owner_id) VALUES (?) ON CONFLICT DO NOTHING", owner);
            boolean demo = false;
            if (useCredit) {
                if (jdbc.update("UPDATE story_credits SET credits=credits-1 WHERE owner_id=? AND credits>0", owner) == 0)
                    fail(HttpStatus.CONFLICT, "STORY_NO_CREDITS", "You have no remaining story credits.");
            } else {
                if (planId == null || version == null) fail(HttpStatus.BAD_REQUEST, "STORY_PLAN_REQUIRED", "Choose a story pack.");
                List<Plan> plans = jdbc.query("SELECT * FROM story_plans WHERE id=? FOR SHARE", this::mapPlan, planId);
                if (plans.isEmpty() || !plans.getFirst().enabled())
                    fail(HttpStatus.CONFLICT, "STORY_PLAN_UNAVAILABLE", "This pack is no longer available. Choose another pack.");
                Plan plan = plans.getFirst();
                if (plan.version() != version) fail(HttpStatus.CONFLICT, "STORY_PLAN_CHANGED", "This pack changed. Review its current price before continuing.");
                if (plan.price().signum() > 0) {
                    if (!demoPurchasesEnabled || !demoPurchase)
                        fail(HttpStatus.CONFLICT, "PAYMENT_UNAVAILABLE", "Payments are not available yet. Your story is saved as a draft.");
                    demo = true;
                }
                jdbc.update("UPDATE story_credits SET credits=credits+? WHERE owner_id=?", plan.storyCount() - 1, owner);
            }
            jdbc.update("UPDATE stories SET status='PUBLISHED',published_at=now(),expires_at=now()+interval '24 hours',"
                    + "plan_id=?,plan_version=?,demo_purchase=? WHERE id=?", useCredit ? null : planId, useCredit ? null : version, demo, id);
        });
        return mineOne(owner, id);
    }

    public MyStories mine(UUID owner) {
        requireCreator(owner);
        return new MyStories(jdbc.query(STORY_SELECT + " WHERE s.owner_id=? AND (s.status='READY'"
                + " OR (s.status='UPLOADING' AND s.upload_expires_at>now())"
                + " OR (s.status='PUBLISHED' AND s.expires_at>now()))"
                + " ORDER BY CASE WHEN s.status IN ('READY','UPLOADING') THEN 0 ELSE 1 END,s.created_at DESC,s.id LIMIT 200",
                this::mapStory, owner), credits(owner));
    }

    public Stories list(int limit, UUID owner) {
        if (limit < 1 || limit > 100) fail(HttpStatus.BAD_REQUEST, "STORY_LIMIT_INVALID", "Limit must be between 1 and 100.");
        String query = STORY_SELECT + " WHERE s.status='PUBLISHED' AND s.expires_at>now() AND u.enabled=true"
                + (owner == null ? "" : " AND s.owner_id=?") + " ORDER BY s.published_at DESC,s.id LIMIT ?";
        return new Stories(owner == null ? jdbc.query(query, this::mapStory, limit) : jdbc.query(query, this::mapStory, owner, limit));
    }

    public void delete(UUID owner, UUID id) {
        String key = tx.execute(status -> {
            requireCreator(owner);
            List<String> rows = jdbc.query("SELECT object_key FROM stories WHERE id=? AND owner_id=? FOR UPDATE",
                    (rs, n) -> rs.getString(1), id, owner);
            if (rows.isEmpty()) notFound();
            jdbc.update("UPDATE stories SET status='DELETED' WHERE id=? AND owner_id=?", id, owner);
            return rows.getFirst();
        });
        deleteQuietly(key);
    }

    private void requireCreator(UUID owner) {
        requireCreator(owner, false);
    }

    private void requireCreator(UUID owner, boolean exclusive) {
        List<String> types = jdbc.query("SELECT account_type FROM app_users WHERE id=? AND enabled=true" + (exclusive ? " FOR UPDATE" : " FOR SHARE"),
                (rs, n) -> rs.getString(1), owner);
        if (types.isEmpty() || !"CREATOR".equals(types.getFirst()))
            fail(HttpStatus.FORBIDDEN, "STORY_CREATOR_REQUIRED", "Only ad creators can post stories.");
    }

    private void requireAdmin(UUID actor) {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM app_users u JOIN user_roles r ON r.user_id=u.id"
                + " WHERE u.id=? AND u.enabled=true AND r.role='ADMIN'", Integer.class, actor);
        if (count == null || count == 0) fail(HttpStatus.FORBIDDEN, "FORBIDDEN", "Only administrators can manage story packs.");
    }

    private int credits(UUID owner) {
        List<Integer> values = jdbc.query("SELECT credits FROM story_credits WHERE owner_id=?", (rs, n) -> rs.getInt(1), owner);
        return values.isEmpty() ? 0 : values.getFirst();
    }

    private UploadRow uploadRow(UUID owner, UUID id) {
        List<UploadRow> rows = jdbc.query("SELECT * FROM stories WHERE id=? AND owner_id=?", (rs, n) -> new UploadRow(id,
                rs.getString("object_key"), rs.getString("content_type"), rs.getLong("size_bytes"),
                rs.getString("checksum_sha256"), rs.getString("status"), instant(rs, "upload_expires_at")), id, owner);
        if (rows.isEmpty()) notFound();
        return rows.getFirst();
    }

    private Story mineOne(UUID owner, UUID id) {
        List<Story> rows = jdbc.query(STORY_SELECT + " WHERE s.id=? AND s.owner_id=? AND s.status<>'DELETED'", this::mapStory, id, owner);
        if (rows.isEmpty()) notFound();
        return rows.getFirst();
    }

    private Story mapStory(ResultSet rs, int n) throws SQLException {
        Instant expires = instant(rs, "expires_at");
        String status = rs.getString("status");
        String url = null;
        if ("READY".equals(status)) url = storage.authorizeDownload(rs.getString("object_key"), Duration.ofMinutes(5)).toString();
        if ("PUBLISHED".equals(status)) {
            Duration remaining = Duration.between(Instant.now(), expires);
            // S3 signatures use whole seconds: never issue a URL with less than a second left.
            if (remaining.getSeconds() < 1) status = "EXPIRED";
            else url = storage.authorizeDownload(rs.getString("object_key"), Duration.ofSeconds(remaining.getSeconds())).toString();
        }
        return new Story(rs.getObject("id", UUID.class), rs.getObject("owner_id", UUID.class), rs.getString("display_name"),
                rs.getString("avatar_url"), url, rs.getString("media_type"), status, instant(rs, "created_at"), instant(rs, "published_at"), expires);
    }

    private Plan mapPlan(ResultSet rs, int n) throws SQLException {
        return new Plan(rs.getObject("id", UUID.class), rs.getString("name"), rs.getBigDecimal("price"), rs.getString("currency"),
                rs.getInt("story_count"), rs.getBoolean("enabled"), rs.getInt("sort_order"), rs.getLong("version"));
    }

    private Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    static boolean matchesType(byte[] bytes, String type) {
        if (bytes.length < 12) return false;
        return switch (type) {
            case "image/jpeg" -> (bytes[0] & 255) == 255 && (bytes[1] & 255) == 216 && (bytes[2] & 255) == 255;
            case "image/png" -> HexFormat.of().formatHex(bytes, 0, 8).equals("89504e470d0a1a0a");
            case "image/webp" -> ascii(bytes, 0, 4).equals("RIFF") && ascii(bytes, 8, 4).equals("WEBP");
            case "video/mp4" -> ascii(bytes, 4, 4).equals("ftyp") && Set.of("isom", "iso2", "mp41", "mp42", "avc1", "M4V ", "MSNV", "dash", "iso6").contains(ascii(bytes, 8, 4));
            case "video/webm" -> HexFormat.of().formatHex(bytes, 0, 4).equals("1a45dfa3")
                    && new String(bytes, 0, Math.min(bytes.length, 4096), StandardCharsets.ISO_8859_1).contains("webm");
            default -> false;
        };
    }

    private static String ascii(byte[] bytes, int offset, int length) { return new String(bytes, offset, length, StandardCharsets.US_ASCII); }
    private void deleteQuietly(String key) {
        try { storage.delete(key); }
        catch (RuntimeException exception) {
            org.slf4j.LoggerFactory.getLogger(StoryService.class).warn("Story object cleanup failed for {}; access stays disabled in the API", key);
        }
    }
    private static void invalidMedia(String message) { fail(HttpStatus.BAD_REQUEST, "STORY_MEDIA_INVALID", message); }
    private static void notFound() { fail(HttpStatus.NOT_FOUND, "STORY_NOT_FOUND", "Story not found."); }
    private static void fail(HttpStatus status, String code, String message) { throw new StoryException(status, code, message); }
}
