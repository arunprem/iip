package gov.`in`.iip.iip_app.secugen

import android.app.Activity
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.embedding.engine.plugins.activity.ActivityAware
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

class SecuGenCapturePlugin : FlutterPlugin, MethodChannel.MethodCallHandler, ActivityAware {
    private var channel: MethodChannel? = null
    private var activity: Activity? = null
    private var appContext: android.content.Context? = null

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        appContext = binding.applicationContext
        channel = MethodChannel(binding.binaryMessenger, CHANNEL).also {
            it.setMethodCallHandler(this)
        }
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel?.setMethodCallHandler(null)
        channel = null
        appContext = null
    }

    override fun onAttachedToActivity(binding: ActivityPluginBinding) {
        activity = binding.activity
    }

    override fun onDetachedFromActivityForConfigChanges() {
        activity = null
    }

    override fun onReattachedToActivityForConfigChanges(binding: ActivityPluginBinding) {
        activity = binding.activity
    }

    override fun onDetachedFromActivity() {
        activity = null
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        val ctx = appContext
        if (ctx == null) {
            result.error("NO_CONTEXT", "Application context unavailable", null)
            return
        }
        when (call.method) {
            "getStatus" -> result.success(SecuGenCaptureEngine.status(ctx))
            "captureTemplate" -> {
                val act = activity
                if (act == null) {
                    result.error("NO_ACTIVITY", "App is not in the foreground", null)
                    return
                }
                val finger = call.argument<String>("fingerPosition") ?: "RIGHT_THUMB"
                Thread {
                    try {
                        val payload = SecuGenCaptureEngine.captureTemplate(act, finger)
                        act.runOnUiThread { result.success(payload) }
                    } catch (e: SecuGenCaptureException) {
                        act.runOnUiThread {
                            result.error(e.code, e.message, null)
                        }
                    } catch (e: Exception) {
                        act.runOnUiThread {
                            result.error(
                                "CAPTURE_FAILED",
                                e.message ?: "Fingerprint capture failed",
                                null,
                            )
                        }
                    }
                }.start()
            }
            else -> result.notImplemented()
        }
    }

    companion object {
        const val CHANNEL = "gov.in.iip.iip_app/secugen"
    }
}
