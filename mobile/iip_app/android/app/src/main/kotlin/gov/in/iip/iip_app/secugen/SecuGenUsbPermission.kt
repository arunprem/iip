package gov.`in`.iip.iip_app.secugen

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import androidx.core.content.ContextCompat

/**
 * Request Android USB permission before SecuGen OpenDevice (required by FDx SDK v4.x).
 */
object SecuGenUsbPermission {
    private const val ACTION = "gov.in.iip.iip_app.USB_PERMISSION"
    private const val VENDOR_SECUGEN = 0x1162

    fun ensurePermission(activity: Activity, timeoutMs: Long = 20_000): Boolean {
        val usb = activity.getSystemService(Context.USB_SERVICE) as UsbManager
        val device = usb.deviceList.values.firstOrNull { it.vendorId == VENDOR_SECUGEN }
            ?: return false
        if (usb.hasPermission(device)) return true

        var granted = false
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action == ACTION) {
                    granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                }
            }
        }

        // Android 14+ (API 34): FLAG_MUTABLE + implicit Intent is disallowed when targetSdk >= 34
        // (matches SecuGen FDx demo JSGDActivity.java)
        val pendingFlags = when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE ->
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
                PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            else ->
                PendingIntent.FLAG_UPDATE_CURRENT
        }
        val permissionIntent = PendingIntent.getBroadcast(
            activity,
            0,
            Intent(ACTION).setPackage(activity.packageName),
            pendingFlags,
        )

        val filter = IntentFilter(ACTION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.registerReceiver(activity, receiver, filter, ContextCompat.RECEIVER_EXPORTED)
        } else {
            @Suppress("DEPRECATION")
            activity.registerReceiver(receiver, filter)
        }

        try {
            usb.requestPermission(device, permissionIntent)
            val deadline = System.currentTimeMillis() + timeoutMs
            while (System.currentTimeMillis() < deadline) {
                if (usb.hasPermission(device)) return true
                if (granted) return usb.hasPermission(device)
                Thread.sleep(250)
            }
            return usb.hasPermission(device)
        } finally {
            try {
                activity.unregisterReceiver(receiver)
            } catch (_: Exception) {
            }
        }
    }

    fun firstSecuGenDevice(activity: Activity): UsbDevice? {
        val usb = activity.getSystemService(Context.USB_SERVICE) as UsbManager
        return usb.deviceList.values.firstOrNull { it.vendorId == VENDOR_SECUGEN }
    }
}
