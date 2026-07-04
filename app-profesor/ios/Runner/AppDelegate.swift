import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate {
  private let beaconPlugin = IosBeaconPlugin()
  private let studentAttendanceBlePlugin = StudentAttendanceBlePlugin()

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GeneratedPluginRegistrant.register(with: self)

    if let controller = window?.rootViewController as? FlutterViewController {
      beaconPlugin.register(with: controller.binaryMessenger)
      studentAttendanceBlePlugin.register(with: controller.binaryMessenger)
    }

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
