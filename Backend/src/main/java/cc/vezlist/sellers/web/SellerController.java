package cc.vezlist.sellers.web;

import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import cc.vezlist.sellers.application.SellerService;
import cc.vezlist.shared.domain.SiteScope;

@RestController
@RequestMapping("/api/v1/sellers")
public class SellerController {
    private final SellerService sellers;
    public SellerController(SellerService sellers) { this.sellers = sellers; }
    @GetMapping("/trending")
    public List<TrendingSellerResponse> trending(@RequestParam SiteScope site,
                                                 @RequestParam(required = false) Integer limit) {
        return sellers.trending(site, limit);
    }
    @GetMapping("/{sellerId}")
    public SellerPageResponse publicProfile(@PathVariable UUID sellerId, @RequestParam SiteScope site,
                                            @RequestParam(required = false) Integer limit) {
        return sellers.publicProfile(sellerId, site, limit);
    }
}
