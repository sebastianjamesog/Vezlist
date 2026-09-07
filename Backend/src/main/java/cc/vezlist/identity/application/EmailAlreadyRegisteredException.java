package cc.vezlist.identity.application;

public class EmailAlreadyRegisteredException extends RuntimeException {
    public EmailAlreadyRegisteredException() {
        super("An account already exists for this email address.");
    }
}
