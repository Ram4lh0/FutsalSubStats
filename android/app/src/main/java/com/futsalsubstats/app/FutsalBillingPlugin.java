package com.futsalsubstats.app;

import android.app.Activity;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@CapacitorPlugin(name = "FutsalBilling")
public class FutsalBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private BillingClient client;
    private final Map<String, ProductDetails> products = new HashMap<>();
    private PluginCall pendingPurchase;

    @Override
    public void load() {
        client = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .build();
    }

    private interface ReadyAction { void run(); }

    private void ready(PluginCall call, ReadyAction action) {
        if (client.isReady()) { action.run(); return; }
        client.startConnection(new BillingClientStateListener() {
            @Override public void onBillingServiceDisconnected() { }
            @Override public void onBillingSetupFinished(BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) action.run();
                else call.reject(result.getDebugMessage(), String.valueOf(result.getResponseCode()));
            }
        });
    }

    @PluginMethod
    public void products(PluginCall call) {
        JSArray ids = call.getArray("ids", new JSArray());
        List<QueryProductDetailsParams.Product> requested = new ArrayList<>();
        try {
            for (Object value : ids.toList()) {
                requested.add(QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(String.valueOf(value))
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build());
            }
        } catch (Exception error) {
            call.reject("Invalid product list", error);
            return;
        }
        ready(call, () -> client.queryProductDetailsAsync(
            QueryProductDetailsParams.newBuilder().setProductList(requested).build(),
            (result, response) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject(result.getDebugMessage(), String.valueOf(result.getResponseCode()));
                    return;
                }
                JSArray list = new JSArray();
                for (ProductDetails detail : response.getProductDetailsList()) {
                    products.put(detail.getProductId(), detail);
                    ProductDetails.SubscriptionOfferDetails offer = firstOffer(detail);
                    ProductDetails.PricingPhase phase = paidPhase(offer);
                    JSObject item = new JSObject();
                    item.put("id", detail.getProductId());
                    item.put("title", detail.getTitle());
                    item.put("description", detail.getDescription());
                    item.put("price", phase == null ? "" : phase.getFormattedPrice());
                    item.put("currency", phase == null ? "" : phase.getPriceCurrencyCode());
                    item.put("offerToken", offer == null ? "" : offer.getOfferToken());
                    list.put(item);
                }
                JSObject payload = new JSObject();
                payload.put("products", list);
                call.resolve(payload);
            }
        ));
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId", "");
        String accountId = call.getString("accountId", "");
        ProductDetails detail = products.get(productId);
        if (detail == null) {
            call.reject("Product details must be loaded before purchase");
            return;
        }
        ProductDetails.SubscriptionOfferDetails offer = firstOffer(detail);
        if (offer == null) { call.reject("No eligible subscription offer"); return; }

        BillingFlowParams.ProductDetailsParams product = BillingFlowParams.ProductDetailsParams
            .newBuilder().setProductDetails(detail).setOfferToken(offer.getOfferToken()).build();
        BillingFlowParams params = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(List.of(product))
            .setObfuscatedAccountId(sha256(accountId))
            .build();
        pendingPurchase = call;
        BillingResult result = client.launchBillingFlow(getActivity(), params);
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            pendingPurchase = null;
            call.reject(result.getDebugMessage(), String.valueOf(result.getResponseCode()));
        }
    }

    @PluginMethod
    public void restore(PluginCall call) {
        ready(call, () -> client.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
            (result, purchases) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject(result.getDebugMessage(), String.valueOf(result.getResponseCode()));
                    return;
                }
                JSArray list = new JSArray();
                for (Purchase purchase : purchases) if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                    list.put(purchasePayload(purchase));
                }
                JSObject payload = new JSObject();
                payload.put("purchases", list);
                call.resolve(payload);
            }
        ));
    }

    @PluginMethod
    public void finish(PluginCall call) { call.resolve(); }

    @Override
    public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        PluginCall call = pendingPurchase;
        if (call == null) return;
        pendingPurchase = null;
        if (result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            call.reject("Purchase cancelled", "USER_CANCELED");
            return;
        }
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null || purchases.isEmpty()) {
            call.reject(result.getDebugMessage(), String.valueOf(result.getResponseCode()));
            return;
        }
        Purchase purchase = purchases.get(0);
        if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) {
            call.reject("Purchase is pending", "PENDING");
            return;
        }
        call.resolve(purchasePayload(purchase));
    }

    private JSObject purchasePayload(Purchase purchase) {
        JSObject payload = new JSObject();
        payload.put("purchaseToken", purchase.getPurchaseToken());
        payload.put("productId", purchase.getProducts().isEmpty() ? "" : purchase.getProducts().get(0));
        payload.put("orderId", purchase.getOrderId());
        return payload;
    }

    private ProductDetails.SubscriptionOfferDetails firstOffer(ProductDetails detail) {
        List<ProductDetails.SubscriptionOfferDetails> offers = detail.getSubscriptionOfferDetails();
        return offers == null || offers.isEmpty() ? null : offers.get(0);
    }

    private ProductDetails.PricingPhase paidPhase(ProductDetails.SubscriptionOfferDetails offer) {
        if (offer == null) return null;
        List<ProductDetails.PricingPhase> phases = offer.getPricingPhases().getPricingPhaseList();
        for (int i = phases.size() - 1; i >= 0; i--) {
            if (phases.get(i).getPriceAmountMicros() > 0) return phases.get(i);
        }
        return phases.isEmpty() ? null : phases.get(phases.size() - 1);
    }

    private String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder();
            for (byte b : digest) out.append(String.format("%02x", b));
            return out.toString();
        } catch (Exception ignored) { return value; }
    }
}
