package cc.vezlist.media.application;

public class MediaNotFoundException extends RuntimeException {
    public MediaNotFoundException() {
        super("The requested image was not found.");
    }
}
