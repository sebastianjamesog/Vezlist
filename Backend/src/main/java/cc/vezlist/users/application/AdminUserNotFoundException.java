package cc.vezlist.users.application;

public class AdminUserNotFoundException extends RuntimeException {
    public AdminUserNotFoundException() {
        super("User not found.");
    }
}
