package cc.vezlist.catalog.application;

/** Thrown when an admin tries to delete a category or area that active listings still reference. */
public class CatalogInUseException extends RuntimeException {
    public CatalogInUseException(String message) {
        super(message);
    }
}
