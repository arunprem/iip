package gov.`in`.iip.iip_app.secugen

import android.app.Activity
import android.content.Context
import android.hardware.usb.UsbManager
import android.util.Base64
import java.lang.reflect.Constructor
import java.lang.reflect.Method

/**
 * Optional SecuGen FDx SDK capture via reflection so the project builds without the AAR.
 * Run scripts/install-secugen-sdk.sh to copy FDxSDKProFDAndroid.jar + jniLibs from the SDK ZIP.
 */
object SecuGenCaptureEngine {
    private const val VENDOR_SECUGEN = 0x1162

    fun sdkInstalled(): Boolean = loadLibClass() != null

    fun usbHostSupported(context: Context): Boolean =
        context.packageManager.hasSystemFeature("android.hardware.usb.host")

    fun deviceAttached(context: Context): Boolean {
        val usb = context.getSystemService(Context.USB_SERVICE) as? UsbManager ?: return false
        return usb.deviceList.values.any { it.vendorId == VENDOR_SECUGEN }
    }

    fun status(context: Context): Map<String, Any?> {
        val sdk = sdkInstalled()
        val usb = usbHostSupported(context)
        val attached = deviceAttached(context)
        val message = when {
            !sdk -> SDK_MISSING_MESSAGE
            !usb -> "This device does not support USB host (OTG). Use a phone/tablet with OTG."
            !attached -> "Connect SecuGen HU20 via USB OTG adapter, then tap Refresh."
            else -> "Scanner detected. Place finger on sensor when capturing."
        }
        return mapOf(
            "sdkInstalled" to sdk,
            "usbHostSupported" to usb,
            "deviceAttached" to attached,
            "ready" to (sdk && usb && attached),
            "deviceModel" to if (attached) "SECUGEN_HU20" else null,
            "message" to message,
        )
    }

    fun captureTemplate(activity: Activity, fingerPosition: String): Map<String, Any?> {
        if (!sdkInstalled()) {
            throw SecuGenCaptureException("SDK_NOT_INSTALLED", SDK_MISSING_MESSAGE)
        }
        if (!usbHostSupported(activity)) {
            throw SecuGenCaptureException(
                "NO_USB_HOST",
                "USB OTG is not supported on this Android device.",
            )
        }
        if (!deviceAttached(activity)) {
            throw SecuGenCaptureException(
                "DEVICE_NOT_FOUND",
                "SecuGen scanner not found. Check OTG cable and reconnect the HU20.",
            )
        }

        val libClass = loadLibClass()
            ?: throw SecuGenCaptureException("SDK_NOT_INSTALLED", SDK_MISSING_MESSAGE)

        if (!SecuGenUsbPermission.ensurePermission(activity)) {
            throw SecuGenCaptureException(
                "USB_PERMISSION_DENIED",
                "USB permission required. Reconnect the scanner and allow access when prompted.",
            )
        }

        val usbManager = activity.getSystemService(Context.USB_SERVICE) as UsbManager
        val sgfplib = newInstance(libClass, activity, usbManager)
        var opened = false
        try {
            callLong(sgfplib, "Init", deviceAutoConstant())
            val openErr = callLong(sgfplib, "OpenDevice", 0L)
            if (openErr != 0L) {
                throw SecuGenCaptureException(
                    "OPEN_DEVICE_FAILED",
                    "Could not open SecuGen device (error $openErr). Grant USB permission if prompted.",
                )
            }
            opened = true

            callLong(sgfplib, "SetTemplateFormat", isoTemplateConstant())

            val deviceInfoClass = Class.forName("SecuGen.FDxSDKPro.SGDeviceInfoParam")
            val deviceInfo = deviceInfoClass.getDeclaredConstructor().newInstance()
            callLong(sgfplib, "GetDeviceInfo", deviceInfo)
            val imageWidth = deviceInfoClass.getField("imageWidth").getInt(deviceInfo)
            val imageHeight = deviceInfoClass.getField("imageHeight").getInt(deviceInfo)

            val maxSizeHolder = IntArray(1)
            callLong(sgfplib, "GetMaxTemplateSize", maxSizeHolder)
            val template = ByteArray(maxSizeHolder[0])
            val rawImage = ByteArray(imageWidth * imageHeight)

            val smartCaptureCmd = smartCaptureCommand()
            callLong(sgfplib, "WriteData", smartCaptureCmd, 1.toByte())
            callLong(sgfplib, "SetLedOn", true)

            val fpInfoClass = Class.forName("SecuGen.FDxSDKPro.SGFingerInfo")
            var bestTemplate: ByteArray? = null
            var bestImage: ByteArray? = null
            var lastImageErr = 0L
            var lastTemplateErr = 0L
            // Best-of-3: keep the largest ISO template (more minutiae → better AFIS match).
            repeat(3) {
                val imageErr = callLong(sgfplib, "GetImage", rawImage)
                if (imageErr != 0L) {
                    lastImageErr = imageErr
                    return@repeat
                }
                val fpInfo = fpInfoClass.getDeclaredConstructor().newInstance()
                template.fill(0)
                val templateErr = callLong(sgfplib, "CreateTemplate", fpInfo, rawImage, template)
                if (templateErr != 0L) {
                    lastTemplateErr = templateErr
                    return@repeat
                }
                val trimmed = trimTemplate(template)
                if (bestTemplate == null || trimmed.size > bestTemplate!!.size) {
                    bestTemplate = trimmed
                    bestImage = rawImage.copyOf()
                }
            }

            val trimmed = bestTemplate
                ?: throw SecuGenCaptureException(
                    "CAPTURE_FAILED",
                    when {
                        lastImageErr != 0L ->
                            "Place your finger flat on the scanner and try again (error $lastImageErr)."
                        lastTemplateErr != 0L ->
                            "Could not create fingerprint template (error $lastTemplateErr)."
                        else -> "Capture failed. Cover the full sensor with your finger."
                    },
                )

            if (trimmed.size < 220) {
                throw SecuGenCaptureException(
                    "LOW_QUALITY",
                    "Fingerprint capture is too weak (${trimmed.size} bytes). " +
                        "Press your finger flat, cover the full sensor, and hold still.",
                )
            }

            val qualityScore = when {
                trimmed.size >= 280 -> 0.95
                trimmed.size >= 250 -> 0.85
                else -> 0.7
            }
            return mapOf(
                "templateBytes" to trimmed,
                "templateFormat" to "ISO19794-2",
                "fingerPosition" to fingerPosition.uppercase(),
                "qualityScore" to qualityScore,
                "templateSize" to trimmed.size,
                "deviceModel" to "SECUGEN_HU20",
                "imageBytes" to (bestImage ?: rawImage),
                "imageWidth" to imageWidth,
                "imageHeight" to imageHeight,
            )
        } finally {
            if (opened) {
                try {
                    callLong(sgfplib, "CloseDevice")
                } catch (_: Exception) {
                }
            }
            try {
                callLong(sgfplib, "Terminate")
            } catch (_: Exception) {
            }
        }
    }

    private fun trimTemplate(template: ByteArray): ByteArray {
        var end = template.size
        while (end > 0 && template[end - 1] == 0.toByte()) end -= 1
        if (end < 32) return template.copyOf()
        return template.copyOf(end)
    }

    private fun loadLibClass(): Class<*>? = try {
        Class.forName("SecuGen.FDxSDKPro.JSGFPLib")
    } catch (_: ClassNotFoundException) {
        null
    }

    private fun newInstance(clazz: Class<*>, vararg args: Any): Any {
        val types: Array<Class<*>> = args.map { it.javaClass as Class<*> }.toTypedArray()
        val ctor = findConstructor(clazz, types) ?: clazz.getDeclaredConstructor(*types)
        return ctor.newInstance(*args)
    }

    private fun findConstructor(clazz: Class<*>, types: Array<Class<*>>): Constructor<*>? {
        return clazz.constructors.firstOrNull { ctor ->
            val params = ctor.parameterTypes
            if (params.size != types.size) return@firstOrNull false
            params.indices.all { i ->
                params[i].isAssignableFrom(types[i]) ||
                    (params[i] == Activity::class.java && types[i] == Activity::class.java)
            }
        }
    }

    // SGFDxDeviceName / SGFDxTemplateFormat are constant holder classes, not Java enums.
    private fun deviceAutoConstant(): Long =
        sdkLongConstant("SecuGen.FDxSDKPro.SGFDxDeviceName", "SG_DEV_AUTO")

    private fun isoTemplateConstant(): Short =
        sdkShortConstant("SecuGen.FDxSDKPro.SGFDxTemplateFormat", "TEMPLATE_FORMAT_ISO19794")

    private fun smartCaptureCommand(): Byte =
        sdkByteConstant("SecuGen.FDxSDKPro.SGFDxConstant", "WRITEDATA_COMMAND_ENABLE_SMART_CAPTURE")

    private fun sdkLongConstant(className: String, field: String): Long {
        val clazz = Class.forName(className)
        return clazz.getField(field).getLong(null)
    }

    private fun sdkShortConstant(className: String, field: String): Short {
        val clazz = Class.forName(className)
        return clazz.getField(field).getShort(null)
    }

    private fun sdkByteConstant(className: String, field: String): Byte {
        val clazz = Class.forName(className)
        return clazz.getField(field).getByte(null)
    }

    private fun callLong(target: Any, name: String, vararg args: Any): Long {
        val method = findMethod(target.javaClass, name, args) ?: error("Method $name not found")
        val result = method.invoke(target, *args)
        return when (result) {
            is Long -> result
            is Int -> result.toLong()
            else -> 0L
        }
    }

    private fun findMethod(clazz: Class<*>, name: String, args: Array<out Any>): Method? {
        return clazz.methods.firstOrNull { method ->
            if (method.name != name) return@firstOrNull false
            val params = method.parameterTypes
            if (params.size != args.size) return@firstOrNull false
            params.indices.all { i -> isAssignable(params[i], args[i]) }
        }
    }

    private fun isAssignable(param: Class<*>, arg: Any): Boolean {
        if (param.isAssignableFrom(arg.javaClass)) return true
        if (param == Boolean::class.javaPrimitiveType && arg is Boolean) return true
        if (param == Int::class.javaPrimitiveType && arg is Int) return true
        if (param == Long::class.javaPrimitiveType && arg is Long) return true
        if (param == Short::class.javaPrimitiveType && arg is Short) return true
        if (param == Byte::class.javaPrimitiveType && arg is Byte) return true
        if (param == ByteArray::class.java && arg is ByteArray) return true
        if (param.isArray && arg.javaClass.isArray) return true
        return param.isInstance(arg)
    }

    private const val SDK_MISSING_MESSAGE =
        "SecuGen SDK not in this APK. Run: mobile/iip_app/scripts/install-secugen-sdk.sh"

    fun templatePreviewBase64(bytes: ByteArray): String =
        Base64.encodeToString(bytes, Base64.NO_WRAP)
}

class SecuGenCaptureException(
    val code: String,
    override val message: String,
) : Exception(message)
