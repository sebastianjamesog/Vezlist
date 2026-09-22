package cc.vezlist.users.application;

public class AdminActionConflictException extends RuntimeException {
    public AdminActionConflictException(String message) {
        super(message);
    }
}
