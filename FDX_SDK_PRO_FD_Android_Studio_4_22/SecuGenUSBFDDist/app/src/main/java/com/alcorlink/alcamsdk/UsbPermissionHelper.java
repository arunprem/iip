package com.alcorlink.alcamsdk;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;

//RILEY
import SecuGen.Driver.SGLog;

public class UsbPermissionHelper {

    private Boolean isDevReady = false;
    private UsbDevice device2wait;
    private SGLog MyLog; //RILEY
    private  final String ACTION_USB_PERMISSION =
            "alcorlink.USB_PERMISSION";

//    public void setUsbDeviceToWait(UsbDevice udev) {
//        device2wait =  udev;
//    }
    private UsbManager manager;
    PendingIntent mPermissionIntent;
    /*
    * A blocking method. returns when device permission is granted or denied.
    * */
    public boolean requestPermissionBlocking(Context ctx, UsbDevice udev) {
        //RILEY MyLog.enter();
        device2wait =  udev;
        registerUsbPermitReceivers(ctx);
        manager = (UsbManager) ctx.getSystemService(Context.USB_SERVICE);
        mPermissionIntent =
                PendingIntent.getBroadcast(ctx, 0, new Intent(ACTION_USB_PERMISSION),  PendingIntent.FLAG_MUTABLE);


        manager.requestPermission(device2wait, mPermissionIntent);
        MyLog.d("wait device");
        waitDevice();
        unRegisterUsbPermitReceivers(ctx);
//        return false;
        boolean bHasPermission = manager.hasPermission(device2wait);
        return bHasPermission;
    }

    private  void waitDevice () {
        while (isDevReady == false) {
            try {
                MyLog.d("Wait ...");
                Thread.sleep(100);
            } catch (InterruptedException e) {
                e.printStackTrace();
            }
        }
    }

    private  void wakeup() {
        isDevReady = true;

    }

    private void registerUsbPermitReceivers( final Context context ) {
        MyLog.d("registerUsbPermitReceivers");
        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_USB_PERMISSION);
        HandlerThread handlerThread = new HandlerThread("ht");
        handlerThread.start();
        Looper looper = handlerThread.getLooper();
        Handler handler = new Handler(looper);
        context.registerReceiver(usbPermitReceiver, filter,null,  handler);
//        context.registerReceiver(usbPermitReceiver, filter );
    }




    private void unRegisterUsbPermitReceivers( final Context context ) {
        MyLog.d("unRegisterUsbPermitReceivers");
        context.unregisterReceiver(usbPermitReceiver);
    }

    private final BroadcastReceiver usbPermitReceiver = new BroadcastReceiver() {

        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            MyLog.d( "usbPermit  Broadcast: " + action);
            if (ACTION_USB_PERMISSION.equals(action)) {
                synchronized (this) {
                    UsbDevice udev = (UsbDevice) intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                    if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false))
                        MyLog.d( "ACTION_USB_PERMISSION accepted");
                        if (udev.equals(device2wait))
                            wakeup();
                    else {
                        MyLog.d("ACTION_USB_PERMISSION denied");
                            if (udev.equals(device2wait))
                                wakeup();
                    }
                }
            }// if (ACTION_USB_PERMISSION.equals(action)) {
        }
    };



//    @Override
//    public void onAttach(UsbDevice device) {
//
//    }
//
//    @Override
//    public void onDettach(UsbDevice device) {
//
//    }
//
//    @Override
//    public void onOpen(UsbDevice device) {
//
//    }
//
//    @Override
//    public void onPermitted(UsbDevice device) {
//        if (device2wait == null)
//            return;
//        if (device.equals(device2wait))
//             wakeup();
//    }
//
//    @Override
//    public void onPermissionCancel(UsbDevice device) {
//        if (device2wait == null)
//            return;
//        if (device.equals(device2wait))
//            wakeup();
//
//    }
}
