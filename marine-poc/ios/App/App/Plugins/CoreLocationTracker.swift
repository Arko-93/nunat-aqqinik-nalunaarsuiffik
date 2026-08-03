import Foundation
import CoreLocation

/// Placeholder for the Capacitor BackgroundLocation plugin (iOS).
/// Locked-screen recording requires CLLocationManager with UIBackgroundModes location.
@objc(CoreLocationTracker)
public class CoreLocationTracker: NSObject, CLLocationManagerDelegate {
  private let manager = CLLocationManager()
  private var isTracking = false

  public override init() {
    super.init()
    manager.delegate = self
    manager.allowsBackgroundLocationUpdates = true
    manager.pausesLocationUpdatesAutomatically = false
    manager.desiredAccuracy = kCLLocationAccuracyBest
  }

  @objc public func start() {
    manager.requestAlwaysAuthorization()
    manager.startUpdatingLocation()
    isTracking = true
  }

  @objc public func stop() {
    manager.stopUpdatingLocation()
    isTracking = false
  }

  public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    // Bridge payloads to JS via Capacitor plugin result / event.
    _ = locations
    _ = isTracking
  }
}
