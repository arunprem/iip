package com.alcorlink.alcamsdk;

import android.content.Context;
import android.graphics.Bitmap;
import android.hardware.usb.UsbDevice;
import android.os.AsyncTask;
import android.widget.TextView;

import com.alcorlink.camera.AKXUS;
import com.alcorlink.camera.AlDevManager;
import com.alcorlink.camera.AlErrorCode;
import com.alcorlink.camera.AlFrame;
import com.alcorlink.camera.CameraException;
import com.alcorlink.camera.StreamConfig;

import java.lang.ref.WeakReference;
import java.util.Timer;
import java.util.TimerTask;

//RILEY
import SecuGen.Driver.SGLog;

public class SecuGenDevice {

    protected SGDeviceHelper mCameraH;
    private AlDevManager mDevMng;
    private AlFrame mImageBuffer;
    private WeakReference<Context> mWeakContext;


    private static final int EEPROM_TEST_START_ADDRESS = 0x2048;
    private static final int SENSOR_TEST_START_ADDRESS = 0xf0;
    public static final int ALCOR_FIRMWARE_LENGTH = 9216;

    private boolean isAutoStart = false;
    //RILEY private LogMessage2UI log;
    private SGLog log;
    private SGLog MyLog;
    private StreamConfig mCurrCfg;
    boolean m_IsStreamMode;
    private int endFlag = 0;

    //RILEYpublic SecuGenDevice(UsbDevice udev, Context ctx, LogMessage2UI log) {
    public SecuGenDevice(UsbDevice udev, Context ctx, SGLog log) {
        SecugenDeviceInit(udev, ctx, log);
    }


    ////////////////////////////////////////////////////////////////////////////////////
    //U-AIR TODO
    public void openCamera(Boolean autoStart) {
            mCameraH.open(null);
    }


    //public void openCamera(Boolean autoStart) {
    //    isAutoStart = autoStart;
    //    if (autoStart == true)
    //        mCameraH.open(new OpenCameraCallback());
    //    else
    //        mCameraH.open(null);
    //}

    ////////////////////////////////////////////////////////////////////////////////////
    //U-AIR DONE
    public boolean isOpened(){
        return mCameraH.isOpened();
    }

    //private void SecugenDeviceInit(UsbDevice udev, Context ctx, LogMessage2UI log) {
    private void SecugenDeviceInit(UsbDevice udev, Context ctx, SGLog log) {
        this.log = log;
        mWeakContext = new WeakReference<Context>(ctx);
        mDevMng = AlDevManager.getInstance(ctx);
        mCameraH = new SGDeviceHelper(ctx, udev, mDevMng);
    }


    private final static int STREAMING_TIME = 10;
    private FramePollingThread mPollingTh;
    private SGFramePollingThread mSGPollingTh;
    private PreviewCallback UI_PreivewCallback;

    public void testStreaming(byte mode, PreviewCallback cb)throws CameraException {
        UI_PreivewCallback = cb;
        LedOn();
        startCamera(mode, new StartCameraAutoRunCallback());

    }


    ////////////////////////////////////////////////////////////////////////////////////
    //U-AIR TODO
    public void SGtestStreaming(byte mode)throws CameraException {
        LedOn();
        SGstartCamera(mode, new SGStartCameraAutoRunCallback());
        try {
            Thread.sleep(1000);
        }
        catch (Exception e) {
            //TODO
        }
        SGstopFramePollingThread();
        LedOff();
        SGstopCamera();
    }



    ////////////////////////////////////////////////////////////////////////////////////
    //U-AIR TODO
    public void SGstartFramePollingThread() {
        if (mSGPollingTh != null) {
            log.e("It is streaming already");
        }
        mSGPollingTh = new SGFramePollingThread();
        mSGPollingTh.setPause(false);
        mSGPollingTh.setRunning(true);
        mSGPollingTh.start();
    }

    ////////////////////////////////////////////////////////////////////////////////////
    //U-AIR TODO
    public void SGstopFramePollingThread() {
        if (mSGPollingTh != null) {
            mSGPollingTh.setRunning(false);
            mSGPollingTh.interrupt();
            mSGPollingTh = null;
        }
    }


    public void startFramePollingThread() {
        if (mPollingTh != null) {
            log.e("It is streaming already");
        }
        mPollingTh = new FramePollingThread();
        mPollingTh.setPause(false);
        mPollingTh.setRunning(true);
        mPollingTh.start();
    }

    public void stopFramePollingThread() {
        if (mPollingTh != null) {
            mPollingTh.setRunning(false);
            mPollingTh.interrupt();
            mPollingTh = null;
        }
    }

    public boolean isStreaming() {
        return mCameraH.isStreaming();
    }



    private void setTimerToStopLoop() {
        TimerTask task = new TimerTask() {
            @Override
            public void run() {
                log.write("Time's up");
                stopFramePollingThread();
                LedOff();
                stopCamera();
                this.cancel();
            }
        };
        new Timer().schedule(task, STREAMING_TIME * 1000);
    }

    ////////////////////////////////////////////////////////////////////////////////////
    //U-AIR DONE
    public void closeUSB() {
        closeCamera();
    }


    ////////////////////////////////////////////////////////////////////////////////////
    //U-AIR TODO
    public void closeCamera() {
        log.write(hashCode2String(this.hashCode()) + "closeCamera");
        if (mCameraH != null) {
            if (mCameraH.isOpened())
                mCameraH.close();
        }
    }


    ////////////////////////////////////////////////////////////////////////////////////
    //U-AIR TODO
    public void SGstartCamera(byte mode, OnReadyCallback cb) throws CameraException {
        log.write(hashCode2String(this.hashCode()) + "======== test SGstartCamera =========");

        mCurrCfg = mCameraH.getDefaultCfg(StreamConfig.VS_FORMAT_UNCOMPRESSED);
        mCameraH.startCamera(mCurrCfg, cb, mode);
        mImageBuffer = new AlFrame(mCurrCfg);
    }

    ////////////////////////////////////////////////////////////////////////////////////
    //U-AIR TODO
    public void SGstopCamera() {
        log.write(hashCode2String(this.hashCode()) + "stopCamera");
        SGstopFramePollingThread();
        mCameraH.stopCamera(null);
    }


    public void startCamera(byte mode, OnReadyCallback cb) throws CameraException {
        log.write(hashCode2String(this.hashCode()) + "======== test startCamera =========");

        mCurrCfg = mCameraH.getDefaultCfg(StreamConfig.VS_FORMAT_UNCOMPRESSED);
        mCameraH.startCamera(mCurrCfg, cb, mode);
        mImageBuffer = new AlFrame(mCurrCfg);
    }

    public void stopCamera() {
        log.write(hashCode2String(this.hashCode()) + "stopCamera");
        stopFramePollingThread();
        mCameraH.stopCamera(null);
    }

    public void GetVersion(TextView tv) {

        MyLog.d("======GetVersion=====>");
        short[] fwVer = new short[]{0x00};
        String[] fwVerString = new String[1];
        int ret = 0;
        String s = "";
        try {
            MyLog.d("======MpFwRevision=====>");
            AKXUS xu = mCameraH.getAKXUS();
            xu.MpFwRevision(fwVer, fwVerString);
            MyLog.d("fwVer=" + String.format("%04x", fwVer[0]));
            MyLog.d("fwVerString=" + fwVerString[0]);
            MyLog.d("======MpFwRevision=====< ret =" + ret);


            //mCameraH.close();
        } catch (CameraException e) {
            s = "GetVersion fail " + e.toString();
            MyLog.e(s);
        }

        StringBuilder b = new StringBuilder()
                .append("firmware version:")
                .append(fwVerString[0])
                .append("-")
                .append(String.format("%04x", fwVer[0]))
                .append("\n UsbBcd:")
                .append(mCameraH.getUsbBcd());
        tv.setText(b.toString());
    }

    ////////////////////////////////////////////////////////////////////////////////////
    //U-AIR DONE
    public boolean SetSensorRegister( short addr, short length, byte[] data)
    {
        String s = "";
        try {
            MyLog.d("======SetSensorRegister=====>");
            AKXUS xu = mCameraH.getAKXUS();
            xu.XuSensorWrite(addr,length, data);
            return true;
        } catch (CameraException e) {
            s = "SetSensorRegister fail " + e.toString();
            MyLog.e(s);
            return false;
        }
    }


    ////////////////////////////////////////////////////////////////////////////////////
    //U-AIR DONE
    public boolean EEPROMRead( short addr, short length, byte[] pBuf) {
        boolean result = true;
        String s = "";
        int bytesread = 0;
        MyLog.d("======SG_EepromRead=====>");
        try {
            AKXUS xu = mCameraH.getAKXUS();
            xu.SgEepromRead(addr, length, pBuf);
            MyLog.d("======SG_EepromRead=====<");
        } catch (CameraException e) {
            s = "EEPROMRead fail " + e.toString();
            MyLog.e(s);
            result = false;
        }
        return result;
    }

    private byte testWriteValue = 0;

    ////////////////////////////////////////////////////////////////////////////////////
    //TODO U-AIR DONE TEST
    public boolean EEPROMWrite( short addr, short length, byte[] pBuf) {
        boolean result = true;
        MyLog.d("======SG_EepromWrite=====>");
        String s = "";
        try {
            AKXUS xu = mCameraH.getAKXUS();
            xu.SgEepromWrite(addr, length, pBuf);
            MyLog.d("======SG_epromWrite=====< ");
        } catch (CameraException e) {
            s = "EEPROMWrite fail " + e.toString();
            MyLog.e(s);
            result = false;
        }
        return result;
    }

    ////////////////////////////////////////////////////////////////////////////////////
    //U-AIR DONE
    public boolean SetAutoPower(byte on) {
        boolean result = false;
        try {
            AKXUS xu = mCameraH.getAKXUS();
            xu.SgSetAutoPower(on);
            result = true;
        } catch (CameraException e) {
            MyLog.e(e.toString());
        }
        return(result);
    }


    public void AutoPowerCtrlEnable(TextView tv) {

        byte on = 0x01;
        String s = "success";
        try {
            MyLog.d("======SgSetAutoPower=====>");
            AKXUS xu = mCameraH.getAKXUS();
            xu.SgSetAutoPower(on);
            MyLog.d("======SgSetAutoPower=====<");
        } catch (CameraException e) {
            s = "AutoPowerCtrlEnable fail " + e.toString();
            MyLog.e(s);
        }
        tv.setText("SgSetAutoPower result:\n" + s);
    }

    public void AutoPowerCtrlDisable(TextView tv) {
        byte on = 0x00;
        String s = "success";
        try {
            MyLog.d("======SgSetAutoPower=====>");
            AKXUS xu = mCameraH.getAKXUS();
            xu.SgSetAutoPower(on);
            MyLog.d("======SgSetAutoPower=====<");
        } catch (CameraException e) {
            s = "AutoPowerCtrlDisable fail " + e.toString();
            MyLog.e(s);
        }

        tv.setText("SgSetAutoPower result:\n" + s);
    }

    public void UsbSpeed(TextView tv) {

        byte usb_speed[] = new byte[]{0x00, 0x00, 0x00};
        String speed = "";
        try {
            MyLog.d("======SgUsbSpeed=====>");
            AKXUS xu = mCameraH.getAKXUS();
            xu.SgUsbSpeed(usb_speed);
            MyLog.d("======SgUsbSpeed=====<  " + " speed=" + usb_speed);
            speed = "speed=" + Integer.toHexString(usb_speed[0] & 0x000000ff);
        } catch (CameraException e) {
            speed = "UsbSpeed fail " + e.toString();
            MyLog.e(speed);
        }
        tv.setText("SgUsbSpeed result:" + "\n" + speed);
    }

    ////////////////////////////////////////////////////////////////////////////////////
    //U-AIR DONE
    public boolean SetSensorResetInit() {
        boolean result = false;
        try {
            AKXUS xu = mCameraH.getAKXUS();
            xu.SgSetSensorResetInit();
            result = true;

            //Added by Seung-Bong to clear VSYNC low issue
            try {
                Thread.sleep(250);
            } catch (InterruptedException e){
                e.printStackTrace();
            }
        } catch (CameraException e) {
            MyLog.e(e.toString());
        }
        return result;
    }


    public void SensorReset(TextView tv) {

        String s = "success";
        try {
            MyLog.d("======SgSetSensorResetInit=====>");
            AKXUS xu = mCameraH.getAKXUS();
            xu.SgSetSensorResetInit();
            MyLog.d("======SgSetSensorResetInit=====<");
        } catch (CameraException e) {
            s = "SensorReset fail " + e.toString();
            MyLog.e(s);
        }

        tv.setText("SgSetSensorResetInit result:\n" + s);
    }

    public void SensorResetPinSet(byte value) throws CameraException {
        AKXUS xu = mCameraH.getAKXUS();
        xu.SgSetSensorResetPin(AKXUS.RESET_PIN_LOW);

    }


    public void SgSetPreviewMode(TextView tv, byte mode) {
        byte on = 0x00;
        String s = "success";
        try {
            MyLog.d("======SgSetPreviewMode " + mode + "=====>");
            AKXUS xu = mCameraH.getAKXUS();
            xu.SgPreviewModeWrite(mode);
            MyLog.d("======SgSetPreviewMode=====<");
        } catch (CameraException e) {
            s = "SgPreviewModeWrite fail " + e.toString();
            MyLog.e(s);
        }
    }

    public void SgImageTrigger() throws CameraException {
        AKXUS xu = mCameraH.getAKXUS();
        xu.SgImageTrigger();
    }

    public void LedTest(TextView tv) {
        new LedBlinkTask().execute();

    }

    ////////////////////////////////////////////////////////////////////////////////////
    //U-AIR DONE
    public void LedOn() {
        byte led = 0x0001; //on
        LeSet(led);
    }

    ////////////////////////////////////////////////////////////////////////////////////
    //U-AIR DONE
    public void LedOff() {
        byte led = 0x0000; //off
        LeSet(led);
    }

    private void LeSet(byte led) {
        try {
            AKXUS xu = mCameraH.getAKXUS();
            if (xu != null)
            xu.SgLedControl(led);
        } catch (CameraException e) {
            String s = e.toString();
            MyLog.d(s);
        }
    }

    public void SensorRead(TextView tv) {
        short addr = SENSOR_TEST_START_ADDRESS;
        short len = 8;
        byte pBuf[] = new byte[len];
        MyLog.d("======SensorRead=====>");
        String s = "";
        try {
            AKXUS xu = mCameraH.getAKXUS();
            if (xu == null) {
                MyLog.d("======xu is null XXXXXXX=====<");
            }
            xu.XuSensorRead(addr, len, pBuf);
            MyLog.d("======SensorRead=====<");
            s = new String();
            for (int i = 0; i < len; i++) {
                s = s + "Read buf[" + i + "]=0x" + Integer.toHexString(0x000000ff & pBuf[i]) + "\n";
                MyLog.d("Read buf[" + i + "]=0x" + Integer.toHexString(0x000000ff & pBuf[i]));
            }
        } catch (CameraException e) {
            s = "SensorRead fail " + e.toString();
            MyLog.e(s);
        }
        tv.setText("SensorRead:" + "\n" + s);
    }

    public void upgrade(String fileName, OnReadyCallback firmwareUpgradeCallback) {
        TaskFwUpgrade ts = new TaskFwUpgrade();
        ts.setFileName(fileName);
        ts.execute(firmwareUpgradeCallback);
    }

    public void reset() throws CameraException {
        mCameraH.reset();

    }



    public class TaskFwUpgrade extends AsyncTask<OnReadyCallback, Void, Integer> {
        public void setFileName(String fileName) {
            this.fileName = fileName;
        }

        private String fileName;
        private OnReadyCallback callback;

        @Override
        protected Integer doInBackground(OnReadyCallback... params) {
            MyLog.d("TaskFwUpgrade");
            String s;
            callback = params[0];
            try {
                new FirmwareHelper().upgrade(mWeakContext.get(), mCameraH.getAKXUS(), fileName);
                s = "UpdateFirmware success";
            } catch (Exception e) {
                s = "Get Exception : " + e.getMessage();
            }

            return 0;
        }

        @Override
        protected void onPostExecute(Integer result) {
            if (callback != null) {
                callback.deviceReady(result);
            }
        }
    }


    private class LedBlinkTask extends AsyncTask<Void, Void, Integer> {
        private static final int PERIOD = 500;// millisecond

        @Override
        protected void onPreExecute() {

        }


        @Override
        protected Integer doInBackground(Void... params) {
            byte led;
            for (int i = 0; i < 5; i++) {
                MyLog.d("Set LED on");

                LedOn();
                try {
                    Thread.sleep(PERIOD);
                } catch (InterruptedException e) {
                    String s = "Get Exception : Exception while led test sleep";
                    //   sendMessage(EVENT_UPDATE_RESULT, s);
                    return -1;
                }
                MyLog.d("Set LED off");
                LedOff();
                try {
                    Thread.sleep(PERIOD);
                } catch (InterruptedException e) {
                    String s = "Get Exception : Exception while led test sleep";
                    //  sendMessage(EVENT_UPDATE_RESULT, s);
                    return -1;
                }

            }

            return 0;
        }

        @Override
        protected void onPostExecute(Integer result) {
        }
    }


    class OpenCameraCallback implements OnReadyCallback {
        @Override
        public int deviceReady(int status) {
            //MyLog.enter();
            if (status == 0) {

                try {
                    if (isAutoStart)
                        startCamera(DEFAULT_PREVIEW_MODE, new StartCameraAutoRunCallback());
                } catch (CameraException e) {
                    //Todo Show: error
                    e.printStackTrace();
                }

            } else {
                //Todo: show error
            }
            return 0;
        }
    }


    class SGStartCameraAutoRunCallback implements OnReadyCallback {
        @Override
        public int deviceReady(int status) {
            log.write("Start Camera result " + status);
            if (status == 0) {
                SGstartFramePollingThread();
            } else {
                /*Todo: show error*/
            }
            return 0;
        }
    }

    class StartCameraAutoRunCallback implements OnReadyCallback {
        @Override
        public int deviceReady(int status) {
            log.write("Start Camera result " + status);
            if (status == 0) {
                startFramePollingThread();
                setTimerToStopLoop();
            } else {
                //Todo: show error
            }
            return 0;
        }
    }


    class StopCameraCallback implements OnReadyCallback {
        @Override
        public int deviceReady(int status) {
            //MyLog.enter();
            if (status == 0 && isAutoStart) {
                closeCamera();
            } else {
                //Todo: show error
            }
            return 0;
        }
    }

    ////////////////////////////////////////////////////////////////////////////////////
    //TODO U-AIR
    class SGFramePollingThread extends Thread implements Runnable {
        private boolean running = true;
        private boolean isPause = true;
        private boolean go2End = false;
        private final int DELAY_MILLI_S = 30;
        private final int POLLING_IMAGE_MILLI_S = 100;

        public void setRunning(boolean running) {

            this.running = running;
        }

        public void setPause(boolean pause) {
            this.isPause = pause;
        }

        protected boolean isRunning() {
            return running;
        }

        private void doImageRoutine() {
            int ret;
            long t = System.currentTimeMillis();
            if (t < nextPollingTime)
                return;

            nextPollingTime = t + POLLING_IMAGE_MILLI_S;

            try {
                ret = getImage();
                if (ret == 0 && mImageBuffer.validBufferLength > 0) {
                    mCameraH.saveImage(mImageBuffer);
//                    MyLog.d("Polling thread to get image " + mImageBuffer.validBufferLength);
                }
            } catch (CameraException e) {
                e.printStackTrace();
            }
        }


        long nextPollingTime;

        private void doDelay(long delay) {
            try {
                Thread.sleep(delay);
            } catch (InterruptedException e) {
                go2End = true;
                MyLog.d(e.toString());
            }
        }

        private void checkPause(long delay) {
            while (isPause == true) {
                try {
                    Thread.sleep(delay);
                } catch (InterruptedException e) {
                    go2End = true;
                    MyLog.d(e.toString());
                }
            }
        }

        @Override
        public void run() {
            //MyLog.enter();
            int ret = 0;
            nextPollingTime = System.currentTimeMillis() + POLLING_IMAGE_MILLI_S;
            while (running) {
                checkPause(DELAY_MILLI_S * 10);
                if (go2End) /* thread is interrupted*/
                    break;
                doImageRoutine();
                doDelay(DELAY_MILLI_S);
            }
            //MyLog.leave();
        }//  public void run()

    }


    class FramePollingThread extends Thread implements Runnable {
        private boolean running = true;
        private boolean isPause = true;
        private boolean go2End = false;
        private final int DELAY_MILLI_S = 30;
        private final int POLLING_IMAGE_MILLI_S = 100;

        public void setRunning(boolean running) {

            this.running = running;
        }

        public void setPause(boolean pause) {
            this.isPause = pause;
        }

        protected boolean isRunning() {
            return running;
        }

        private void doImageRoutine() {
            int ret;
            long t = System.currentTimeMillis();
            if (t < nextPollingTime)
                return;

            nextPollingTime = t + POLLING_IMAGE_MILLI_S;

            try {
                ret = getImage();
                if (ret == 0 && mImageBuffer.validBufferLength > 0) {
                    showImageYUV(mImageBuffer);
                    mCameraH.saveImage(mImageBuffer);
//                    MyLog.d("Polling thread to get image " + mImageBuffer.validBufferLength);
                }
            } catch (CameraException e) {
                e.printStackTrace();
            }
        }


        long nextPollingTime;

        private void doDelay(long delay) {
            try {
                Thread.sleep(delay);
            } catch (InterruptedException e) {
                go2End = true;
                MyLog.d(e.toString());
            }
        }

        private void checkPause(long delay) {
            while (isPause == true) {
                try {
                    Thread.sleep(delay);
                } catch (InterruptedException e) {
                    go2End = true;
                    MyLog.d(e.toString());
                }
            }
        }

        @Override
        public void run() {
            //MyLog.enter();
            int ret = 0;
            nextPollingTime = System.currentTimeMillis() + POLLING_IMAGE_MILLI_S;
            while (running) {
                checkPause(DELAY_MILLI_S * 10);
                if (go2End) // thread is interrupted
                    break;
                doImageRoutine();
                doDelay(DELAY_MILLI_S);
            }
            //MyLog.leave();
        }//  public void run()


        private void showImageYUV(AlFrame frame) {
            if (mCameraH == null)
                return;//shows error?
            byte[] frameBytes = frame.getFrameByteArray();// .getFrameByteBuffer();
            Bitmap bp = null;
            StreamConfig cfg = new StreamConfig();

            cfg.height = mCurrCfg.height * 2;//The real image size from sensor
            cfg.width = mCurrCfg.width;
            bp = mCameraH.YUV2Bitmap(frameBytes, cfg);//it is bayer actually.
            // bp = mCameraH.bitmapScaled(bp, getApplicationContext(), cfg);
            if (bp == null) //what would you do when bitmapFactory fail to decode??
                return;
            if (UI_PreivewCallback != null)
                UI_PreivewCallback.updateOnUI(bp);
        }



    }

    public static final Byte DEFAULT_PREVIEW_MODE = AKXUS.PREVIEW_SNAPSHOT_MODE;
//    public static final Byte DEFAULT_PREVIEW_MODE = AKXUS.PREVIEW_CONTINUOUS_MODE;
    private Byte mCurrentPreviewMode = DEFAULT_PREVIEW_MODE;


    ////////////////////////////////////////////////////////////////////////////////////
    //U-AIR DONE
    private int startVideoStream_snapshot(){
        try {
            mCurrCfg = mCameraH.getDefaultCfg(StreamConfig.VS_FORMAT_UNCOMPRESSED);
            //this.mCameraH.getAKXUS().SgLedControl((byte)0x01);
            this.mCameraH.getAKImage().videoStart(mCurrCfg,AKXUS.PREVIEW_SNAPSHOT_MODE);
            mImageBuffer = new AlFrame(mCurrCfg);
            return 0;
        }
        catch (Exception e){
            ;//TODO Report
            return -1;
        }

    }

    ////////////////////////////////////////////////////////////////////////////////////
    //U-AIR DONE
    private int startVideoStream(){
        try {
            mCurrCfg = mCameraH.getDefaultCfg(StreamConfig.VS_FORMAT_UNCOMPRESSED);
            //this.mCameraH.getAKXUS().SgLedControl((byte)0x01);
            this.mCameraH.getAKImage().videoStart(mCurrCfg,AKXUS.PREVIEW_CONTINUOUS_MODE);
            mImageBuffer = new AlFrame(mCurrCfg);
            return 0;
        }
        catch (Exception e){
            ;//TODO Report
            return -1;
        }

    }


    ////////////////////////////////////////////////////////////////////////////////////
    //TODO U-AIR DONE TEST
    private int stopVideoStream(){
        try {
            this.mCameraH.getAKImage().videoStop(mCurrCfg);
            //this.mCameraH.getAKXUS().SgLedControl((byte)0x00);
            return 0;
        }
        catch (Exception e){
            ;//TODO Report
            return -1;
        }

    }

    ////////////////////////////////////////////////////////////////////////////////////
    //U-AIR DONE
    private int SG_SnapshotModeEnable(){
        try {
            mCurrentPreviewMode = AKXUS.PREVIEW_SNAPSHOT_MODE;
            this.mCameraH.getAKXUS().SgPreviewModeWrite(AKXUS.PREVIEW_SNAPSHOT_MODE);
            return 0;
        }
        catch (Exception e){
            ;//TODO Report
            return -1;
        }
    }

    ////////////////////////////////////////////////////////////////////////////////////
    //U-AIR DONE
    private int SG_StreamModeEnable(){
        try {
            mCurrentPreviewMode = AKXUS.PREVIEW_CONTINUOUS_MODE;
            this.mCameraH.getAKXUS().SgPreviewModeWrite(AKXUS.PREVIEW_CONTINUOUS_MODE);
            return 0;
        }
        catch (Exception e){
            ;//TODO Report
            return -1;
        }
    }



    ////////////////////////////////////////////////////////////////////////////////////
    //U-AIR DONE
    private int SG_SnapshotModeTrigger(){
        try {
            //synchronized (this) {
                SgImageTrigger();
            //}
            //this.mCameraH.getAKXUS().SgImageTrigger();
            return 0;
        }
        catch (Exception e){
            ;//TODO Report
            return -1;
        }
    }

    ////////////////////////////////////////////////////////////////////////////////////
    //TODO U-AIR TEST
    //bool CAU3826::CaptureStart()
    boolean CaptureStart()
    {
//TODO Log        AU3826_DBG_PRINT("CAU3826::CaptureStart()\n");

//      if (!m_opened)
//        goto ERROR;
        if (!this.isOpened())
            return false;

        //if (m_akav_id >= 0) // if already started
        //    goto ERROR;

        endFlag = 0;
        //if(SG_SnapshotModeEnable(g_pDevObj)){
//        goto ERROR;
        if(SG_SnapshotModeEnable() < 0){
            return false;
        }

//#ifdef AL_VERSION_2
//TODO Log        AU3826_DBG_PRINT("startVideoStream_snapshot()\n");
        //if(startVideoStream_snapshot(g_pDevObj, NULL, g_pDevInfo) < 0){
        if(startVideoStream_snapshot() < 0){
//TODO Log            AU3826_DBG_PRINT(" - returned false\n");
            return false;
        }

        try{
            Thread.sleep(10);
        }
        catch (Exception e)
        {
            //TODO
        }


        //#else
//#ifndef _USE_ALCORLINK_VER_1_1_2
//        if(startVideoStream() < 0){
//        goto ERROR;
//        }
//#else
//        DEVICE_INFO_T* pDevInfo = malloc(sizeof(DEVICE_INFO_T));
//        pDevInfo->bus = libusb_get_bus_number(g_dev);
//        pDevInfo->devID = libusb_get_device_address(g_dev);
//
//        if(startVideoStream(g_pDevObj, cb, pDevInfo) < 0){
//        goto ERROR;
//        }
//
//        free(pDevInfo);
//#endif
//#endif

//TODO Log        AU3826_DBG_PRINT(" - returned true\n");
        return true;

//        ERROR:
//        AU3826_DBG_PRINT(" - returned false\n");
//        return false;
    }


    ////////////////////////////////////////////////////////////////////////////////////
    //TODO U-AIR TEST
    //bool CAU3826::CaptureStartStreamMode()
    public boolean CaptureStartStreamMode() {
//        AU3826_DBG_PRINT("CAU3826::CaptureStartStream()\n");

//        if (!m_opened)
//        goto ERROR;
         if (!this.isOpened())
             return false;

        //if (m_akav_id >= 0) // if already started
        //    goto ERROR;

        endFlag = 0;

//        if(SG_StreamModeEnable(g_pDevObj)){
//        goto ERROR;
        if(SG_StreamModeEnable() < 0){
            return false;
        }

//        if(startVideoStream(g_pDevObj, cb, g_pDevInfo) < 0){
//            AU3826_DBG_PRINT(" - returned false\n");
            if(startVideoStream() < 0){
            return false;
        }

        m_IsStreamMode = true;

//        AU3826_DBG_PRINT(" - returned true\n");
        return true;

//        ERROR:
//        AU3826_DBG_PRINT(" - returned false\n");
//        return false;
    }

    ////////////////////////////////////////////////////////////////////////////////////
    //TODO U-AIR TEST
    //bool CAU3826::CaptureStop()
    public boolean CaptureStop()
    {
//        AU3826_DBG_PRINT("CAU3826::CaptureStop()\n");

        if (m_IsStreamMode) {
            while(endFlag != 1){
                try {
                    //usleep(10 * 1000); // 10ms
                    Thread.sleep(10); // 10ms
                }
                catch (Exception e) {
                    ;//TODO
                }
            }

//            stopVideoStream(g_pDevObj);
            stopVideoStream();

            // To change VSYNC to HIGH in stream mode, change to Snapshot mode and discard one frame.
            DiscardOneFrame();

            m_IsStreamMode = false;
        }

//        AU3826_DBG_PRINT(" - returned true\n");
        return true;

//        ERROR:
//        AU3826_DBG_PRINT(" - returned false\n");
//        return false;
    }

    ////////////////////////////////////////////////////////////////////////////////////
    //TODO U-AIR TEST
    //bool CAU3826::DiscardOneFrame(void)
    boolean DiscardOneFrame()
    {
//        AU3826_DBG_PRINT("CAU3826::DiscardOneFrame()\n");
//        if (!this->CaptureStart())
//        goto ERROR;
        if (!CaptureStart())
        return false;

//        if(SG_SnapshotModeTrigger(g_pDevObj)){
//            goto ERROR;
//        }
        if(this.SG_SnapshotModeTrigger() < 0)
            return false;

//        stopVideoStream(g_pDevObj);
        stopVideoStream();

//        AU3826_DBG_PRINT(" - returned true\n");
        return true;

//        ERROR:
//        AU3826_DBG_PRINT(" - returned false\n");
//        return false;
    }


    //This code works in AlcorLink demo, but not here.
    public boolean testSnapshot2(){
        //Capture single frame from device
        try {
            mCurrCfg = mCameraH.getDefaultCfg(StreamConfig.VS_FORMAT_UNCOMPRESSED);
            mImageBuffer = new AlFrame(mCurrCfg);
            this.mCameraH.getAKXUS().SgPreviewModeWrite(AKXUS.PREVIEW_CONTINUOUS_MODE);
            this.mCameraH.getAKXUS().SgLedControl((byte)0x01);
            this.mCameraH.getAKImage().videoStart(mCurrCfg, AKXUS.PREVIEW_CONTINUOUS_MODE);
            Thread.sleep(100); //RILEY Added
            this.mCameraH.getAKXUS().SgImageTrigger();
            int result = this.mCameraH.getAKImage().getVideo(mImageBuffer,2000);
            this.mCameraH.getAKImage().videoStop(mCurrCfg);
            this.mCameraH.getAKXUS().SgLedControl((byte)0x00);
            return true;
        }
        catch (Exception e) {
            //TODO handle exception
            return false;
        }
    }


    //This code works in AlcorLink demo, but not here.
    public boolean testSnapshot(){
        //Capture single frame from device
        try {
            mCurrCfg = mCameraH.getDefaultCfg(StreamConfig.VS_FORMAT_UNCOMPRESSED);
            MyLog.d("testSnapshot - mCurrCfg.streamId-" + mCurrCfg.streamId + " --format " + mCurrCfg.format + " config res=" + mCurrCfg.width + "x" + mCurrCfg.height);
            mImageBuffer = new AlFrame(mCurrCfg);
            MyLog.d("testSnapshot - mImageBuffer.streamId-" + mImageBuffer.getStreamId() + " --mClockFrequency " + mImageBuffer.mClockFrequency + " --pts " + mImageBuffer.pts + "--serialId " + mImageBuffer.serialId);
            this.mCameraH.getAKXUS().SgPreviewModeWrite(AKXUS.PREVIEW_SNAPSHOT_MODE);
            this.mCameraH.getAKXUS().SgLedControl((byte)0x01);
            this.mCameraH.getAKImage().videoStart(mCurrCfg, AKXUS.PREVIEW_SNAPSHOT_MODE);
            Thread.sleep(10); //RILEY Added
            this.mCameraH.getAKXUS().SgImageTrigger();
            int result = this.mCameraH.getAKImage().getVideo(mImageBuffer,2000);
            MyLog.d("testSnapshot - getAKImage().getVideo() returned -" + result);
            this.mCameraH.getAKImage().videoStop(mCurrCfg);
            this.mCameraH.getAKXUS().SgLedControl((byte)0x00);
            return true;
        }
        catch (Exception e) {
            //TODO handle exception
            return false;
        }
    }
    public void setSecuGenRegisters(){
/*
Output from Linux driver
        CVxdInterface::SetSensorRegister() addr=FE, data=00 PASS
        CVxdInterface::SetSensorRegister() addr=03, data=01 PASS
        CVxdInterface::SetSensorRegister() addr=04, data=F4 PASS
        CVxdInterface::SetSensorRegister() addr=FE, data=00 PASS
        CVxdInterface::SetSensorRegister() addr=09, data=00 PASS
        CVxdInterface::SetSensorRegister() addr=0A, data=A6 PASS
        CVxdInterface::SetSensorRegister() addr=0B, data=00 PASS
        CVxdInterface::SetSensorRegister() addr=0C, data=BA PASS
        CVxdInterface::SetSensorRegister() addr=FE, data=00 PASS
        CVxdInterface::SetSensorRegister() addr=03, data=01 PASS
        CVxdInterface::SetSensorRegister() addr=04, data=F4 PASS
        CVxdInterface::SetSensorRegister() addr=FE, data=00 PASS
        CVxdInterface::SetSensorRegister() addr=03, data=01 PASS
        CVxdInterface::SetSensorRegister() addr=04, data=F4 PASS
*/

        short[] address = {
                (short)0xFE,
                (short)0x03,
                (short)0x04,
                (short)0xFE,
                (short)0x09,
                (short)0x0A,
                (short)0x0B,
                (short)0x0C,
                (short)0xFE,
                (short)0x03,
                (short)0x04,
                (short)0xFE,
                (short)0x03,
                (short)0x04,
        };
        byte[] data = {
                (byte)0x00,
                (byte)0x01,
                (byte)0xF4,
                (byte)0x00,
                (byte)0x00,
                (byte)0xA6,
                (byte)0x00,
                (byte)0xBA,
                (byte)0x00,
                (byte)0x01,
                (byte)0xF4,
                (byte)0x00,
                (byte)0x01,
                (byte)0xF4
        };
        for (int i=0; i<address.length; ++i) {
            byte[] value = new byte[1];
            value[0] = data[0];

            if (true) {
                SetSensorRegister(address[i], (short) 1, value);
                MyLog.d("SetSensorRegister() addr=" + address[i] + " data= " + data[i] + " PASS");
            }
            else {
                try {
                    this.mCameraH.getAKXUS().XuSensorWrite(address[i], (short) 1, value);
                    MyLog.d("this.mCameraH.getAKXUS().XuSensorWrite addr=" + address[i] + " data= " + data[i] + " PASS");
                } catch (CameraException e) {
                    ;//TODO
                }
            }
        }
    }

    public boolean ReadFrame4(byte[] image_buf){
        boolean ret = testSnapshot();
        return ret;
    }


    ////////////////////////////////////////////////////////////////////////////////////
    //TODO U-AIR
    //bool CAU3826::ReadFrame(BYTE *image_buf)
    public boolean ReadFrame(byte[] image_buf)
    {
//        setSecuGenRegisters();
        if (!this.CaptureStart())
            return false;

//TODO Log        AU3826_DBG_PRINT("CAU3826::ReadFrame(image_buf: %p)\n", (void *)image_buf);
    /*
    imagePacket_t packet = {0};
    int i;

    if (m_akav_id < 0)
        goto ERROR;

    for (i = 0; packet.size == 0; i++) {
        usleep(10000); // 10 ms
        packet = AKAV_getVideo(m_akav_id);
    }

    AU3826_DBG_PRINT(" - packet.index: %d\n", packet.index);
    */

        //if(this.SG_SnapshotModeTrigger(g_pDevObj)){
        if(this.SG_SnapshotModeTrigger() < 0){
            return false;
        }

        int ret = mCameraH.getImage(mImageBuffer);

        /*
        try {
            Thread.sleep(5);
        }
        catch (Exception e)
        {
            ;//TODO
        }
        int result = mCameraH.getAKImage().getVideo(mImageBuffer, 2000);
        if (result != 0){
            int count = 0;
            do {
                try {
                    Thread.sleep(5);
                }
                catch (Exception e)
                {
                    ;//TODO
                }
                result = mCameraH.getAKImage().getVideo(mImageBuffer, 2000);
                ++ count;
            }
            while (result !=0 & count <10);
        }

 */
        int validBufferLength = mImageBuffer.validBufferLength;

//#ifdef AL_VERSION_2
//        memcpy(g_pFrameBuf, g_pDevInfo->uvc_frame->data, g_pDevInfo->uvc_frame->data_bytes);
//#else
//        while(!endFlag){
//            usleep(1000);
//        }
//#endif

//#ifdef AL_VERSION_2
//        this.stopVideoStream(g_pDevObj);
        this.stopVideoStream();
//#else
//#ifndef _USE_ALCORLINK_VER_1_1_2
//        stopVideoStream();
//#else
//        stopVideoStream(g_pDevObj);
//#endif
//#endif

//        memcpy(image_buf, g_pFrameBuf, 1400*1000);
//        for (int i=0; i<1400*1000; ++i)
//            image_buf[i] = g_pFrameBuf[i];
        //AKAV_cleanVideoBuffer(m_akav_id);

        byte[] imageData = this.mImageBuffer.getFrameByteArray();
        int buffLen = image_buf.length;
        int frameBuffLen = imageData.length;

        for (int i=0; i<imageData.length; ++i)
            image_buf[i] = imageData[i];

//Log        AU3826_DBG_PRINT("CAU3826::ReadFrame(image_buf: %p)\n", (void *)image_buf);

//Log        AU3826_DBG_PRINT(" - returned true\n");
        return true;

//        ERROR:
//        AU3826_DBG_PRINT(" - returned false\n");
//        return false;
    }


    public boolean ReadFrame1(byte[] image_buf) {
        try{
            testStreaming(AKXUS.PREVIEW_SNAPSHOT_MODE,null);
            return true;
        }
        catch (Exception e){
            return false;
        }

    }

    ////////////////////////////////////////////////////////////////////////////////////
    //TODO U-AIR
    //bool CAU3826::ReadFrame(BYTE *image_buf)
    public boolean ReadFrame0(byte[] image_buf) {
        UI_PreivewCallback = null;
        LedOn();
        try {
            startCamera(AKXUS.PREVIEW_SNAPSHOT_MODE, new StartCameraAutoRunCallback());
            return true;
        }
        catch (Exception e)
        {
            ;//TODO
            return false;
        }

    }

    ////////////////////////////////////////////////////////////////////////////////////
    //TODO U-AIR
    //bool CAU3826::ReadFrame(BYTE *image_buf)
    public boolean ReadFrame2(byte[] image_buf)
    {
        if (!this.CaptureStart())
            return false;

//TODO Log        AU3826_DBG_PRINT("CAU3826::ReadFrame(image_buf: %p)\n", (void *)image_buf);
    /*
    imagePacket_t packet = {0};
    int i;

    if (m_akav_id < 0)
        goto ERROR;

    for (i = 0; packet.size == 0; i++) {
        usleep(10000); // 10 ms
        packet = AKAV_getVideo(m_akav_id);
    }

    AU3826_DBG_PRINT(" - packet.index: %d\n", packet.index);
    */

        //if(this.SG_SnapshotModeTrigger(g_pDevObj)){
        if(this.SG_SnapshotModeTrigger() < 0){
            return false;
        }

        int ret = mCameraH.getImage(mImageBuffer);

        /*
        try {
            Thread.sleep(5);
        }
        catch (Exception e)
        {
            ;//TODO
        }
        int result = mCameraH.getAKImage().getVideo(mImageBuffer, 2000);
        if (result != 0){
            int count = 0;
            do {
                try {
                    Thread.sleep(5);
                }
                catch (Exception e)
                {
                    ;//TODO
                }
                result = mCameraH.getAKImage().getVideo(mImageBuffer, 2000);
                ++ count;
            }
            while (result !=0 & count <10);
        }

 */
        int validBufferLength = mImageBuffer.validBufferLength;

//#ifdef AL_VERSION_2
//        memcpy(g_pFrameBuf, g_pDevInfo->uvc_frame->data, g_pDevInfo->uvc_frame->data_bytes);
//#else
//        while(!endFlag){
//            usleep(1000);
//        }
//#endif

//#ifdef AL_VERSION_2
//        this.stopVideoStream(g_pDevObj);
        this.stopVideoStream();
//#else
//#ifndef _USE_ALCORLINK_VER_1_1_2
//        stopVideoStream();
//#else
//        stopVideoStream(g_pDevObj);
//#endif
//#endif

//        memcpy(image_buf, g_pFrameBuf, 1400*1000);
//        for (int i=0; i<1400*1000; ++i)
//            image_buf[i] = g_pFrameBuf[i];
        //AKAV_cleanVideoBuffer(m_akav_id);

        byte[] imageData = this.mImageBuffer.getFrameByteArray();
        int buffLen = image_buf.length;
        int frameBuffLen = imageData.length;

        for (int i=0; i<image_buf.length; ++i)
            image_buf[i] = imageData[i];

//Log        AU3826_DBG_PRINT("CAU3826::ReadFrame(image_buf: %p)\n", (void *)image_buf);

//Log        AU3826_DBG_PRINT(" - returned true\n");
        return true;

//        ERROR:
//        AU3826_DBG_PRINT(" - returned false\n");
//        return false;
    }

    public int getImage() throws CameraException {
        int ret;
        long startTime = System.currentTimeMillis();
        if (mCurrentPreviewMode == AKXUS.PREVIEW_SNAPSHOT_MODE) {
            synchronized (this) {
                SgImageTrigger();
            }
        }
        ret = mCameraH.getImage(mImageBuffer);
        long endTimeTime = System.currentTimeMillis();
        if (ret == 0) {
            log.write(hashCode2String(this.hashCode()) +"getImage " + mImageBuffer.validBufferLength
                    + " duration=" + (endTimeTime - startTime));
        } else if (ret == AlErrorCode.ERR_TIMEOUT) {
            log.write(hashCode2String(this.hashCode()) + "ERR_TIMEOUT" + " duration=" + (endTimeTime - startTime));
        } else
            log.write(hashCode2String(this.hashCode()) + "getImage " + AlErrorCode.errorCode2String(ret));
        return ret;
    }

    private String hashCode2String(int hashcode) {
        String s =  Integer.toString(hashcode);
        int len = s.length();
        return String.format("[%s] ", Integer.toString(hashcode).substring(len-4, len));
    }

    ////////////////////////////////////////////////////////////////////////////////////
    //TODO U-AIR DONE TEST
    public boolean TouchStatusRead(byte[] data) {
        boolean result = false;
        try {
            AKXUS xu = mCameraH.getAKXUS();
            xu.SgTouchStatus(data);
            result = true;
        } catch (CameraException e) {
            MyLog.e(e.toString());
        }
        return(result);
    }

    ////////////////////////////////////////////////////////////////////////////////////
    //TODO U-AIR DONE TEST
    public boolean ReadFirmware(byte[] fwData) {
        boolean result = false;
        int[] sizeRead = new int[1];
        if (fwData.length != ALCOR_FIRMWARE_LENGTH)
            return false;
        try {
            AKXUS xu = mCameraH.getAKXUS();
            xu.MPFwDump(fwData, ALCOR_FIRMWARE_LENGTH, sizeRead);
            result = true;
        } catch (CameraException e) {
            MyLog.e(e.toString());
        }
        return(result);
    }


}