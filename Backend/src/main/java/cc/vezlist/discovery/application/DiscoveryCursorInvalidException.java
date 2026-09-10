package cc.vezlist.discovery.application;

public class DiscoveryCursorInvalidException extends RuntimeException {
    public DiscoveryCursorInvalidException() {
        super("The discovery cursor is invalid or does not match these filters.");
    }
}
