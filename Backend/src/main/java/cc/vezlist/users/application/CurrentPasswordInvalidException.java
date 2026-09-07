package cc.vezlist.users.application;

public class CurrentPasswordInvalidException extends RuntimeException {
    public CurrentPasswordInvalidException() {
        super("The current password is incorrect.");
    }
}
