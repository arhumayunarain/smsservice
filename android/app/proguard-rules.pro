# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.

# Keep Socket.IO client
-keep class io.socket.** { *; }
-keep class okhttp3.** { *; }
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable

# Keep Hilt generated classes
-keep class dagger.hilt.** { *; }
-keep class javax.inject.** { *; }

# Keep ML Kit
-keep class com.google.mlkit.** { *; }
