package cc.vezlist.listings.application;

public class ListingNotFoundException extends RuntimeException {
    public ListingNotFoundException() {
        super("Listing was not found.");
    }
}
