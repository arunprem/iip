package gov.`in`.iip.iip_app

import gov.`in`.iip.iip_app.secugen.SecuGenCapturePlugin
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine

class MainActivity : FlutterFragmentActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        flutterEngine.plugins.add(SecuGenCapturePlugin())
    }
}
