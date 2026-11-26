require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

# The universal iOS layer this package is built and tested with, the same version the Expo config plugin
# adds to the Podfile by default (DEFAULT_IOS_VERSION in plugin/src/withApproov.ts). The layer and its SDK
# are not on CocoaPods trunk, so the Podfile names their git source (the Expo config plugin adds both, from
# a tag, or the layer from a local path with ios.podPath); this podspec only states the version.
approov_service_ios_version = "3.7.0"

# The pod of @approov/approov-service-react-native 3.5.x, which brings its own interceptor and SDK binding
# and must not be built into the same app.
legacy_pod_name = "approov-service-react-native"

# refuse pod install when the app also depends on the 3.5.x package; only a Podfile pod install has already
# loaded is read, since asking Pod::Config for it would evaluate the Podfile again from this directory
loaded_podfile = defined?(Pod::Config) ? Pod::Config.instance.instance_variable_get(:@podfile) : nil
if (podfile = loaded_podfile)
  if podfile.dependencies.any? { |dependency| dependency.root_name == legacy_pod_name }
    raise Pod::Informative, "@approov/approov-react-native cannot be built alongside @approov/approov-service-react-native " \
      "(pod #{legacy_pod_name}): both intercept the app's networking and both bring an Approov SDK. Remove " \
      "@approov/approov-service-react-native from the app's dependencies, then run pod install again"
  end
end

Pod::Spec.new do |s|
  s.name         = "ApproovReactNative"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]
  s.source       = { :git => "https://github.com/approov-alpha/approov-react-native.git", :tag => s.version.to_s }

  # React Native 0.82 and later, whose own floor is iOS 15.1; the universal layer needs iOS 15
  s.platforms    = { :ios => "15.1" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.swift_versions = ["5.0", "6.0"]

  s.dependency "approov-service-ios", approov_service_ios_version

  # the npm version, for the user property approov-react-native/<version> set at load
  s.pod_target_xcconfig = {
    "DEFINES_MODULE" => "YES",
    "GCC_PREPROCESSOR_DEFINITIONS" => "$(inherited) APPROOV_REACT_NATIVE_VERSION=#{s.version}",
  }

  # React Native, Codegen and the TurboModule headers
  install_modules_dependencies(s)
end
