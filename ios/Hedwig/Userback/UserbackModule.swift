import Foundation
import React

@objc(UserbackModule)
final class UserbackModule: NSObject {
    @objc
    static func requiresMainQueueSetup() -> Bool {
        true
    }

    @objc(start:resolver:rejecter:)
    func start(
        _ options: NSDictionary,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let accessToken = String(describing: options["accessToken"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !accessToken.isEmpty else {
            reject("USERBACK_NO_TOKEN", "Missing Userback access token.", nil)
            return
        }

        let userData = options["userData"] as? [String: Any] ?? [:]

        DispatchQueue.main.async {
            UserbackSDK.shared.start(accessToken: accessToken, userData: userData)
            resolve(true)
        }
    }

    @objc(openForm:resolver:rejecter:)
    func openForm(
        _ mode: NSString?,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.main.async {
            UserbackSDK.shared.openForm(mode: (mode as String?) ?? "general")
            resolve(true)
        }
    }

    @objc(close:rejecter:)
    func close(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.main.async {
            UserbackSDK.shared.close()
            resolve(true)
        }
    }

    @objc(isAvailable:rejecter:)
    func isAvailable(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        resolve(true)
    }
}
