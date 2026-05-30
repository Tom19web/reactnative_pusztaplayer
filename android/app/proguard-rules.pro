# React Native
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-dontwarn com.facebook.**

# react-native-video (ExoPlayer)
-keep class com.brentvatne.exoplayer.** { *; }
-keep class androidx.media3.** { *; }
-dontwarn androidx.media3.**

# AsyncStorage
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# react-native-screens
-keep class com.swmansion.rnscreens.** { *; }

# react-native-safe-area-context
-keep class com.th3rdwave.safeareacontext.** { *; }

# react-native-svg
-keep class com.horcrux.svg.** { *; }

# react-native-linear-gradient
-keep class com.BV.LinearGradient.** { *; }

# App-specific
-keep class com.pusztaplayer.** { *; }

# Keep all ViewManagers and their event handling
-keep class * extends com.facebook.react.uimanager.ViewGroupManager { *; }
-keep class * extends com.facebook.react.uimanager.SimpleViewManager { *; }

# General Android
-keepattributes *Annotation*,SourceFile,LineNumberTable
-keep public class * extends android.app.Activity
-keep public class * extends android.app.Application
