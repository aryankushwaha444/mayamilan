require 'xcodeproj'

podfile = 'ios/Podfile'
unless File.exist?(podfile)
  abort 'Run this from the Mobile folder after npx expo prebuild --clean --platform ios'
end

text = File.read(podfile)

patch = <<~'RB'
  # PATCH: disable explicit modules for ExpoModulesJSI simulator build
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['SWIFT_ENABLE_EXPLICIT_MODULES'] = 'NO'
      config.build_settings['CLANG_ENABLE_EXPLICIT_MODULES'] = 'NO'
    end
  end
RB

unless text.include?('SWIFT_ENABLE_EXPLICIT_MODULES')
  text = text.sub(/(post_install do \|installer\|)/) { "#{$1}\n#{patch}" }
  File.write(podfile, text)
  puts 'Patched ios/Podfile'
else
  puts 'ios/Podfile already patched'
end

Dir.glob('ios/*.xcodeproj').each do |proj_path|
  project = Xcodeproj::Project.open(proj_path)
  changed = false

  project.targets.each do |target|
    target.build_configurations.each do |config|
      ['SWIFT_ENABLE_EXPLICIT_MODULES', 'CLANG_ENABLE_EXPLICIT_MODULES'].each do |key|
        if config.build_settings[key] != 'NO'
          config.build_settings[key] = 'NO'
          changed = true
        end
      end
    end
  end

  project.save if changed
  puts "Patched #{proj_path}"
end
