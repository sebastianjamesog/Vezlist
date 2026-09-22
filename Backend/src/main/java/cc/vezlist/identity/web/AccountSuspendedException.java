package cc.vezlist.identity.web;

public class AccountSuspendedException extends RuntimeException {
    public AccountSuspendedException() {
        super("This account has been suspended.");
    }
}
