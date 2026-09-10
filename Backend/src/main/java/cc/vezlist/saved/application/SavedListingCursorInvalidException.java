package cc.vezlist.saved.application;

public class SavedListingCursorInvalidException extends RuntimeException {
    public SavedListingCursorInvalidException() {
        super("The saved-listing cursor is invalid or does not match this account and site.");
    }
}
