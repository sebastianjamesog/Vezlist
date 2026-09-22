package cc.vezlist.catalog.application;

public class CatalogNotFoundException extends RuntimeException {
    public CatalogNotFoundException(String message) {
        super(message);
    }
}
