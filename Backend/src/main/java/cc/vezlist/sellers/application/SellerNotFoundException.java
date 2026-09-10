package cc.vezlist.sellers.application;

public class SellerNotFoundException extends RuntimeException {
    public SellerNotFoundException() { super("Seller not found."); }
}
