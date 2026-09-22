package cc.vezlist.verification.application;

public class VerificationNotFoundException extends RuntimeException {
    public VerificationNotFoundException() {
        super("Verification request was not found.");
    }
}
