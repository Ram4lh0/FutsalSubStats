import UIKit
import Capacitor
import StoreKit

@available(iOS 15.0, *)
@objc(FutsalBillingPlugin)
public class FutsalBillingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FutsalBillingPlugin"
    public let jsName = "FutsalBilling"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "products", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise)
    ]

    @objc func products(_ call: CAPPluginCall) {
        let ids = call.getArray("ids", String.self) ?? []
        Task {
            do {
                let values = try await Product.products(for: ids)
                let payload = values.map { product in
                    ["id": product.id, "title": product.displayName,
                     "description": product.description, "price": product.displayPrice]
                }
                call.resolve(["products": payload])
            } catch { call.reject("Could not load products", nil, error) }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId"),
              let account = call.getString("accountId"),
              let accountId = UUID(uuidString: account) else {
            call.reject("Invalid product or account")
            return
        }
        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("Product not found")
                    return
                }
                let result = try await product.purchase(options: [.appAccountToken(accountId)])
                switch result {
                case .success(let verification):
                    let transaction = try verified(verification)
                    call.resolve(transactionPayload(transaction))
                case .pending: call.reject("Purchase is pending", "PENDING")
                case .userCancelled: call.reject("Purchase cancelled", "USER_CANCELED")
                @unknown default: call.reject("Unknown purchase result")
                }
            } catch { call.reject("Purchase failed", nil, error) }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                var values: [[String: Any]] = []
                for await result in Transaction.currentEntitlements {
                    if case .verified(let transaction) = result {
                        values.append(transactionPayload(transaction))
                    }
                }
                call.resolve(["purchases": values])
            } catch { call.reject("Restore failed", nil, error) }
        }
    }

    @objc func finish(_ call: CAPPluginCall) {
        guard let raw = call.getString("transactionId"), let id = UInt64(raw) else {
            call.reject("Invalid transaction")
            return
        }
        Task {
            for await result in Transaction.currentEntitlements {
                if case .verified(let transaction) = result, transaction.id == id {
                    await transaction.finish()
                    call.resolve()
                    return
                }
            }
            call.resolve()
        }
    }

    private func verified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .verified(let value): return value
        case .unverified(_, let error): throw error
        }
    }

    private func transactionPayload(_ transaction: Transaction) -> [String: Any] {
        ["transactionId": String(transaction.id),
         "originalTransactionId": String(transaction.originalID),
         "productId": transaction.productID]
    }
}

class FutsalBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        if #available(iOS 15.0, *) { bridge?.registerPluginType(FutsalBillingPlugin.self) }
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = FutsalBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
