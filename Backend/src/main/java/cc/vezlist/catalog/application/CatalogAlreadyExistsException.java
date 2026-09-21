package cc.vezlist.catalog.application;

public class CatalogAlreadyExistsException extends RuntimeException {
    public CatalogAlreadyExistsException(String message) {
        super(message);
    }
}
